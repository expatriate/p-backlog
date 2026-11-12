import { createHash } from "node:crypto";
import { basename, join } from "node:path";
import { attributeLine, flushEstimates, newTranscriptState, transcriptLineSchema } from "../stats/cost/attribute";
import { sum } from "../numbers";
import { statsPeriod } from "../stats/weeks";
import { addTokens } from "../stats/cost/token-counts";
import type { TranscriptState, UsageBucket } from "../stats/cost/usage-state";
import { EMPTY_FINGERPRINT, listDir, NEWLINE, readAt, readFileAt, statOrNull, withFile } from "../store/fs-utils";
import { parseJson } from "../store/json-file";
import type { UsageCache, UsageCacheEntry } from "./usage-cache";
import { retainedSince } from "../model/history-window";

export type TranscriptFile = { path: string; size: number; mtimeMs: number };

export type ScanTranscriptsInput = {
  files: readonly TranscriptFile[];
  cache: UsageCache;
  byteBudget: number;
  now: Date;
};

export type ScanTranscriptsResult = { cache: UsageCache; bytesRead: number; bytesLeft: number; filesDone: number; prunedBuckets: number };

const FINGERPRINT_BYTES = 256;
const ABANDONED_LINE_MS = 10 * 60 * 1000;
const COUNTED_LINE_MARKERS = ['"type":"assistant"', '"type":"user"'];

export async function listTranscripts(claudeProjectsDir: string): Promise<TranscriptFile[]> {
  const files: TranscriptFile[] = [];
  for (const projectEntry of await listDir(claudeProjectsDir)) {
    if (!projectEntry.isDirectory()) continue;
    const projectDir = join(claudeProjectsDir, projectEntry.name);
    for (const entry of await listDir(projectDir)) {
      const entryPath = join(projectDir, entry.name);
      if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        files.push(...(await listedFile(entryPath)));
        continue;
      }
      if (!entry.isDirectory()) continue;
      for (const subagentEntry of await listDir(join(entryPath, "subagents"), { recursive: true })) {
        if (subagentEntry.isFile() && subagentEntry.name.endsWith(".jsonl")) files.push(...(await listedFile(join(subagentEntry.parentPath, subagentEntry.name))));
      }
    }
  }
  return files;
}

async function listedFile(path: string): Promise<TranscriptFile[]> {
  const stats = await statOrNull(path);
  return stats === null ? [] : [{ path, size: stats.size, mtimeMs: stats.mtimeMs }];
}

type ChunkLimits = { longestReadableLine: number; now: Date };

type ScanStart = { offset: number; state: TranscriptState; buckets: UsageBucket[] };

export async function scanTranscripts({ files, cache, byteBudget, now }: ScanTranscriptsInput): Promise<ScanTranscriptsResult> {
  let remainingBudget = byteBudget;
  const listedFiles: Record<string, UsageCacheEntry> = {};

  for (const file of files) {
    const { entry, budgetUsed } = await scanFile(file, cache.files[file.path], remainingBudget, { longestReadableLine: byteBudget, now });
    listedFiles[file.path] = entry;
    remainingBudget -= budgetUsed;
    await yieldToEventLoop();
  }

  const stillReported = deletedStillReported(listedFiles, now);
  const merged: UsageCache = {
    ...cache,
    files: { ...entriesWhere(cache.files, (path, entry) => stillReported(path, entry.buckets)), ...listedFiles },
    carried: entriesWhere(cache.carried, stillReported),
  };
  const pruned = withoutStaleBuckets(merged, now);

  return {
    cache: pruned,
    bytesRead: byteBudget - remainingBudget,
    bytesLeft: sum(Object.values(listedFiles).map((entry) => entry.size - entry.offset)),
    filesDone: Object.values(listedFiles).filter((entry) => entry.offset === entry.size).length,
    prunedBuckets: bucketCount(merged) - bucketCount(pruned),
  };
}

type FileScan = { entry: UsageCacheEntry; budgetUsed: number };

async function scanFile(file: TranscriptFile, previous: UsageCacheEntry | undefined, budget: number, limits: ChunkLimits): Promise<FileScan> {
  const resumable = previous !== undefined && (await continues(file, previous));
  const start: ScanStart = resumable ? { offset: previous.offset, state: structuredClone(previous.state), buckets: previous.buckets } : { offset: 0, state: newTranscriptState(), buckets: [] };
  const chunkSize = Math.min(file.size - start.offset, budget);
  const scanned = await scanChunk(file, start, chunkSize, limits);
  const unmoved = resumable && scanned.offset === previous.offset;
  const fingerprint = unmoved ? previous.fingerprint : await fingerprintOf(file.path, scanned.offset);
  return { entry: { ...scanned, mtimeMs: file.mtimeMs, fingerprint }, budgetUsed: Math.max(chunkSize, 0) };
}

function withoutStaleBuckets(cache: UsageCache, now: Date): UsageCache {
  const retained = retainedSince(now);
  const fresh = (buckets: UsageBucket[]) => {
    const kept = buckets.filter((bucket) => Date.parse(bucket.slot) >= retained);
    return kept.length === buckets.length ? buckets : kept;
  };
  return {
    ...cache,
    files: Object.fromEntries(Object.entries(cache.files).map(([path, entry]) => [path, { ...entry, buckets: fresh(entry.buckets) }])),
    carried: Object.fromEntries(Object.entries(cache.carried).map(([path, buckets]) => [path, fresh(buckets)])),
  };
}

function bucketCount(cache: UsageCache): number {
  return sum([...Object.values(cache.files).map((entry) => entry.buckets.length), ...Object.values(cache.carried).map((buckets) => buckets.length)]);
}

function deletedStillReported(listedFiles: Readonly<Record<string, UsageCacheEntry>>, now: Date): (path: string, buckets: UsageBucket[]) => boolean {
  const reportStart = statsPeriod(now).from;
  const listedSessions = new Set(Object.keys(listedFiles).map((path) => basename(path)));
  return (path, buckets) => !listedSessions.has(basename(path)) && buckets.some((bucket) => Date.parse(bucket.slot) >= reportStart);
}

function entriesWhere<T>(records: Readonly<Record<string, T>>, keeps: (path: string, value: T) => boolean): Record<string, T> {
  return Object.fromEntries(Object.entries(records).filter(([path, value]) => keeps(path, value)));
}

async function scanChunk(file: TranscriptFile, start: ScanStart, chunkSize: number, { longestReadableLine, now }: ChunkLimits): Promise<Omit<UsageCacheEntry, "fingerprint">> {
  if (chunkSize <= 0) return { size: file.size, offset: start.offset, state: start.state, buckets: start.buckets };

  const chunk = await readFileAt(file.path, start.offset, chunkSize);
  const tailAbandoned = start.offset + chunk.length === file.size && now.getTime() - file.mtimeMs >= ABANDONED_LINE_MS;
  const readableLength = tailAbandoned ? chunk.length : chunk.lastIndexOf(NEWLINE) + 1;
  if (readableLength === 0) {
    const lineTooLong = chunk.length >= longestReadableLine;
    return { size: file.size, offset: start.offset + (lineTooLong ? chunk.length : 0), state: start.state, buckets: start.buckets };
  }

  const bucketsByKey = new Map(start.buckets.map((bucket) => [bucketKey(bucket), bucket]));
  for (const line of chunk.subarray(0, readableLength).toString("utf8").split("\n")) {
    if (!COUNTED_LINE_MARKERS.some((marker) => line.includes(marker))) continue;
    const parsed = parseJson(line, transcriptLineSchema);
    if (parsed === null) continue;
    for (const addition of attributeLine(parsed, start.state)) addBucket(bucketsByKey, addition);
  }

  const offset = start.offset + readableLength;
  if (offset === file.size) for (const addition of flushEstimates(start.state)) addBucket(bucketsByKey, addition);
  return { size: file.size, offset, state: start.state, buckets: [...bucketsByKey.values()] };
}

async function continues(file: TranscriptFile, previous: UsageCacheEntry): Promise<boolean> {
  if (file.size < previous.size) return false;
  if (file.size === previous.size && file.mtimeMs === previous.mtimeMs) return true;
  return (await fingerprintOf(file.path, previous.offset)) === previous.fingerprint;
}

async function fingerprintOf(path: string, offset: number): Promise<string> {
  if (offset === 0) return EMPTY_FINGERPRINT;
  const edge = Math.min(FINGERPRINT_BYTES, offset);
  return withFile(path, async (handle) => {
    const head = await readAt(handle, 0, edge);
    const tail = await readAt(handle, offset - edge, edge);
    return createHash("sha1").update(head).update(tail).digest("hex");
  });
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function addBucket(buckets: Map<string, UsageBucket>, addition: UsageBucket): void {
  const key = bucketKey(addition);
  const existing = buckets.get(key);
  buckets.set(key, existing === undefined ? addition : combineBuckets(existing, addition));
}

function bucketKey(bucket: UsageBucket): string {
  return JSON.stringify([bucket.slot, bucket.cwd, bucket.model, bucket.kind]);
}

function combineBuckets(existing: UsageBucket, addition: UsageBucket): UsageBucket {
  return { ...existing, tokens: addTokens(existing.tokens, addition.tokens), hookTurns: existing.hookTurns + addition.hookTurns };
}
