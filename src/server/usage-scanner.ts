import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { errorText, warnPathErrors } from "../core/errors";
import { MINUTE_MS } from "../core/model/dates";
import { BYTES_PER_MEBIBYTE, sum } from "../core/numbers";
import type { ScanProgress } from "../core/stats/types";
import { createJsonlTail } from "../core/store/jsonl-tail";
import { relativeInside } from "../core/store/paths";
import { cachedRepoRoots, unreadableDirHasNoRepo, type GitRoots } from "../core/store/resolve-project";
import { attemptReportingFailure, statOrNull } from "../core/store/fs-utils";
import { cliRunSchema, RUNS_FILE, type CliRun } from "../core/store/runs";
import { listTranscripts, scanTranscripts, type TranscriptFile } from "../core/usage/transcripts";
import { emptyUsageCache, readUsageCache, usageBucketsOf, writeUsageCache, type UsageCache, type UsageCacheEntry } from "../core/usage/usage-cache";
import type { LocalizedWarn } from "./messages";

export type UsageScannerOptions = {
  root: string;
  claudeProjectsDir: string;
  byteBudget?: number;
  intervalMs?: number;
  warn: LocalizedWarn;
  now?: () => Date;
};

export type UsageSnapshot = { cache: UsageCache; scan: ScanProgress; revision: number };

type PassEnd = "budget-spent" | "settled";

type Schedule = { running: false } | { running: true; timer?: ReturnType<typeof setTimeout> };

export type UsageScanner = {
  start: () => void;
  stop: () => Promise<void>;
  scanOnce: () => Promise<PassEnd>;
  scanIfNeverListed: () => void;
  snapshot: () => UsageSnapshot;
};

const DEFAULT_BYTE_BUDGET = 16 * BYTES_PER_MEBIBYTE;
const DEFAULT_INTERVAL_MS = MINUTE_MS;
export const CATCH_UP_DELAY_MS = 100;
const NOT_LISTED: ScanProgress = { listed: false, filesTotal: 0, filesDone: 0, bytesLeft: 0 };
const STOPPED: Schedule = { running: false };

export function createUsageScanner({ root, claudeProjectsDir, byteBudget = DEFAULT_BYTE_BUDGET, intervalMs = DEFAULT_INTERVAL_MS, warn, now = () => new Date() }: UsageScannerOptions): UsageScanner {
  let cache: UsageCache | null = null;
  let scan: ScanProgress = NOT_LISTED;
  let revision = 0;
  let inFlight: Promise<PassEnd> | null = null;
  let schedule: Schedule = STOPPED;

  const onErrorAfterPublish = warnPathErrors((line) => void warn(() => line));
  const runsTail = createJsonlTail<CliRun>(join(root, RUNS_FILE), cliRunSchema);
  const newOutsideOwners = outsideWorktreeRecorder();

  const setScan = (next: ScanProgress): void => {
    if (!scanEquals(scan, next)) revision += 1;
    scan = next;
  };

  const runPass = async (): Promise<PassEnd> => {
    const published = cache ?? emptyUsageCache();
    const current = cache ?? (await readUsageCache(root));
    const files = await listTranscripts(claudeProjectsDir);
    setScan(progressBefore(files, current));
    const result = await scanTranscripts({ files, cache: current, byteBudget, now: now() });
    const { values: runs } = await runsTail.read();
    const added = await newOutsideOwners(result.cache, runs);
    const next = added.length === 0 ? result.cache : { ...result.cache, worktreeRepos: withNewOwners(result.cache.worktreeRepos, added, now()) };
    if (cacheChanged(published, next)) revision += 1;
    cache = next;
    setScan({ listed: true, filesTotal: files.length, filesDone: result.filesDone, bytesLeft: result.bytesLeft });
    if (result.bytesRead > 0 || result.prunedBuckets > 0 || added.length > 0) await writeUsageCache(root, next, onErrorAfterPublish);
    return result.bytesRead >= byteBudget ? "budget-spent" : "settled";
  };

  const scanOnce = (): Promise<PassEnd> => {
    inFlight ??= runPass()
      .catch(async (error: unknown): Promise<PassEnd> => {
        await warn((messages) => messages.transcriptsScanFailed(errorText(error)));
        return "settled";
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  };

  const tick = async (): Promise<void> => {
    const end = await scanOnce();
    if (schedule.running) schedule = { running: true, timer: setTimeout(() => void tick(), end === "budget-spent" ? CATCH_UP_DELAY_MS : intervalMs) };
  };

  return {
    start: () => {
      schedule = { running: true };
      void tick();
    },
    stop: async () => {
      if (schedule.running) clearTimeout(schedule.timer);
      schedule = STOPPED;
      await inFlight;
    },
    scanOnce,
    scanIfNeverListed: () => {
      if (!scan.listed && inFlight === null) void scanOnce();
    },
    snapshot: () => ({ cache: cache ?? emptyUsageCache(), scan, revision }),
  };
}

type ObservedOwner = GitRoots & { createdAt: number | null };

type SettledCwd = { worktree: string; createdAt: number | null } | typeof IN_OWN_REPO;

const IN_OWN_REPO = "in-own-repo";

function outsideWorktreeRecorder(): (scanned: UsageCache, runs: readonly CliRun[]) => Promise<ObservedOwner[]> {
  const lookupNewCwd = cachedRepoRoots({ onUnreadable: unreadableDirHasNoRepo });
  const lookupChangedCwd = cachedRepoRoots({ onUnreadable: unreadableDirHasNoRepo, ttlMs: 0 });
  const settledCwds = new Map<string, SettledCwd>();
  const isStillSettled = async (cwd: string): Promise<boolean> => {
    const settled = settledCwds.get(cwd);
    if (settled === undefined) return false;
    return settled === IN_OWN_REPO || (await worktreeCreatedAt(settled.worktree)) === settled.createdAt;
  };
  const observeOutsideOwner = async (cwd: string): Promise<ObservedOwner | null> => {
    if ((await isStillSettled(cwd)) || !existsSync(cwd)) return null;
    const roots = await (settledCwds.has(cwd) ? lookupChangedCwd : lookupNewCwd)(cwd);
    if (typeof roots === "string") return null;
    if (relativeInside(roots.main, roots.worktree) !== null) {
      settledCwds.set(cwd, IN_OWN_REPO);
      return null;
    }
    const createdAt = await worktreeCreatedAt(roots.worktree);
    settledCwds.set(cwd, { worktree: roots.worktree, createdAt });
    return { ...roots, createdAt };
  };
  return async (scanned, runs) => {
    const cwds = new Set([...usageBucketsOf(scanned), ...runs].map((entry) => entry.cwd));
    const observed = await Promise.all([...cwds].filter((cwd) => isAbsolute(cwd)).map(observeOutsideOwner));
    const newOwners = observed.filter((owner) => owner !== null).filter((owner) => scanned.worktreeRepos[owner.worktree]?.at(-1)?.main !== owner.main);
    return [...new Map(newOwners.map((owner) => [owner.worktree, owner])).values()];
  };
}

async function worktreeCreatedAt(worktree: string): Promise<number | null> {
  const gitFile = await attemptReportingFailure(join(worktree, ".git"), statOrNull, unreadableDirHasNoRepo);
  return gitFile?.mtimeMs ?? null;
}

function withNewOwners(worktreeRepos: UsageCache["worktreeRepos"], owners: readonly ObservedOwner[], now: Date): UsageCache["worktreeRepos"] {
  const tenuresOf = ({ worktree, main, createdAt }: ObservedOwner) => [...(worktreeRepos[worktree] ?? []), { main, since: createdAt ?? now.getTime() }];
  return { ...worktreeRepos, ...Object.fromEntries(owners.map((owner) => [owner.worktree, tenuresOf(owner)])) };
}

function scanEquals(a: ScanProgress, b: ScanProgress): boolean {
  return a.listed === b.listed && a.filesTotal === b.filesTotal && a.filesDone === b.filesDone && a.bytesLeft === b.bytesLeft;
}

function cacheChanged(previous: UsageCache, next: UsageCache): boolean {
  const previousPaths = Object.keys(previous.files);
  const sameFileSet = previousPaths.length === Object.keys(next.files).length;
  const sameKeptRecords = isDeepStrictEqual(previous.carried, next.carried) && isDeepStrictEqual(previous.worktreeRepos, next.worktreeRepos);
  if (!sameFileSet || !sameKeptRecords) return true;
  return previousPaths.some((path) => entryChanged(previous.files[path], next.files[path]));
}

function entryChanged(previous: UsageCacheEntry | undefined, next: UsageCacheEntry | undefined): boolean {
  if (previous === undefined || next === undefined) return previous !== next;
  return previous.size !== next.size || previous.offset !== next.offset || previous.fingerprint !== next.fingerprint || !isDeepStrictEqual(previous.buckets, next.buckets);
}

function progressBefore(files: readonly TranscriptFile[], cache: UsageCache): ScanProgress {
  const offsetOf = (file: TranscriptFile) => {
    const cached = cache.files[file.path];
    return cached !== undefined && file.size >= cached.size ? cached.offset : 0;
  };
  return {
    listed: true,
    filesTotal: files.length,
    filesDone: files.filter((file) => offsetOf(file) === file.size).length,
    bytesLeft: sum(files.map((file) => file.size - offsetOf(file))),
  };
}
