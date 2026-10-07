import { isDeepStrictEqual } from "node:util";
import { errorText } from "../core/errors";
import { sum } from "../core/numbers";
import type { ScanProgress } from "../core/stats/types";
import { listTranscripts, scanTranscripts, type TranscriptFile } from "../core/usage/transcripts";
import { emptyUsageCache, readUsageCache, writeUsageCache, type UsageCache, type UsageCacheEntry } from "../core/usage/usage-cache";
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

export type UsageScanner = {
  start: () => void;
  stop: () => Promise<void>;
  scanOnce: () => Promise<PassEnd>;
  scanIfNeverListed: () => void;
  snapshot: () => UsageSnapshot;
};

const DEFAULT_BYTE_BUDGET = 16 * 1024 * 1024;
const DEFAULT_INTERVAL_MS = 60_000;
export const CATCH_UP_DELAY_MS = 100;
const NOT_LISTED: ScanProgress = { listed: false, filesTotal: 0, filesDone: 0, bytesLeft: 0 };

export function createUsageScanner({ root, claudeProjectsDir, byteBudget = DEFAULT_BYTE_BUDGET, intervalMs = DEFAULT_INTERVAL_MS, warn, now = () => new Date() }: UsageScannerOptions): UsageScanner {
  let cache: UsageCache | null = null;
  let scan: ScanProgress = NOT_LISTED;
  let revision = 0;
  let inFlight: Promise<PassEnd> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;

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
    if (cacheChanged(published, result.cache)) revision += 1;
    cache = result.cache;
    setScan({ listed: true, filesTotal: files.length, filesDone: result.filesDone, bytesLeft: result.bytesLeft });
    if (result.bytesRead > 0 || result.prunedBuckets > 0) await writeUsageCache(root, result.cache);
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
    if (running) timer = setTimeout(() => void tick(), end === "budget-spent" ? CATCH_UP_DELAY_MS : intervalMs);
  };

  return {
    start: () => {
      running = true;
      void tick();
    },
    stop: () => {
      running = false;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      return inFlight === null ? Promise.resolve() : inFlight.then(() => undefined);
    },
    scanOnce,
    scanIfNeverListed: () => {
      if (!scan.listed && inFlight === null) void scanOnce();
    },
    snapshot: () => ({ cache: cache ?? emptyUsageCache(), scan, revision }),
  };
}

function scanEquals(a: ScanProgress, b: ScanProgress): boolean {
  return a.listed === b.listed && a.filesTotal === b.filesTotal && a.filesDone === b.filesDone && a.bytesLeft === b.bytesLeft;
}

function cacheChanged(previous: UsageCache, next: UsageCache): boolean {
  const previousPaths = Object.keys(previous.files);
  if (previousPaths.length !== Object.keys(next.files).length) return true;
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
