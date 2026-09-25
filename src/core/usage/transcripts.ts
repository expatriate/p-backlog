import { createHash } from "node:crypto";
import { open, stat, type FileHandle } from "node:fs/promises";
import { basename, join } from "node:path";
import { attributeLine, flushEstimates, newTranscriptState } from "../stats/cost/attribute";
import { sum } from "../stats/numbers";
import { DAY_MS } from "../model/lifecycle";
import { addTokens } from "../stats/cost/token-counts";
import { COST_REPORT_DAYS, type TranscriptState, type UsageBucket } from "../stats/cost/usage-state";
import { listDir } from "../store/fs-utils";
import { USAGE_CACHE_VERSION, type UsageCache, type UsageCacheEntry } from "./usage-cache";

export type TranscriptFile = { path: string; size: number; mtimeMs: number };

export type ScanTranscriptsInput = {
  files: readonly TranscriptFile[];
  cache: UsageCache;
  byteBudget: number;
  now: Date;
};

export type ScanTranscriptsResult = { cache: UsageCache; bytesRead: number; bytesLeft: number; filesDone: number };

const NEWLINE = 0x0a;
const FINGERPRINT_BYTES = 256;
const ABANDONED_LINE_MS = 10 * 60 * 1000;
const EMPTY_FINGERPRINT = createHash("sha1").digest("hex");
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
  try {
    const { size, mtimeMs } = await stat(path);
    return [{ path, size, mtimeMs }];
  } catch {
    return [];
  }
}

type ChunkLimits = { longestReadableLine: number; now: Date };

type ScanStart = { offset: number; state: TranscriptState; buckets: UsageBucket[] };

export async function scanTranscripts({ files, cache, byteBudget, now }: ScanTranscriptsInput): Promise<ScanTranscriptsResult> {
  let remainingBudget = byteBudget;
  const listedFiles: Record<string, UsageCacheEntry> = {};

  for (const file of files) {
    const previous = cache.files[file.path];
    const resumable = previous !== undefined && (await continues(file, previous));
    const start: ScanStart = resumable ? { offset: previous.offset, state: structuredClone(previous.state), buckets: previous.buckets } : { offset: 0, state: newTranscriptState(), buckets: [] };

    const chunkSize = Math.min(file.size - start.offset, remainingBudget);
    const scanned = await scanChunk(file, start, chunkSize, { longestReadableLine: byteBudget, now });
    const unmoved = resumable && scanned.offset === previous.offset;
    listedFiles[file.path] = { ...scanned, mtimeMs: file.mtimeMs, fingerprint: unmoved ? previous.fingerprint : await fingerprintOf(file.path, scanned.offset) };
    if (chunkSize > 0) remainingBudget -= chunkSize;
    await yieldToEventLoop();
  }

  return {
    cache: { version: USAGE_CACHE_VERSION, files: { ...deletedStillReported(cache, listedFiles, now), ...listedFiles } },
    bytesRead: byteBudget - remainingBudget,
    bytesLeft: sum(Object.values(listedFiles).map((entry) => entry.size - entry.offset)),
    filesDone: Object.values(listedFiles).filter((entry) => entry.offset === entry.size).length,
  };
}

function deletedStillReported(cache: UsageCache, listedFiles: Readonly<Record<string, UsageCacheEntry>>, now: Date): Record<string, UsageCacheEntry> {
  const reportStart = now.getTime() - COST_REPORT_DAYS * DAY_MS;
  const listedSessions = new Set(Object.keys(listedFiles).map((path) => basename(path)));
  return Object.fromEntries(
    Object.entries(cache.files).filter(([path, entry]) => !listedSessions.has(basename(path)) && entry.buckets.some((bucket) => Date.parse(bucket.slot) >= reportStart)),
  );
}

async function scanChunk(file: TranscriptFile, start: ScanStart, chunkSize: number, { longestReadableLine, now }: ChunkLimits): Promise<Omit<UsageCacheEntry, "fingerprint">> {
  if (chunkSize <= 0) return { size: file.size, offset: start.offset, state: start.state, buckets: start.buckets };

  const chunk = await readChunk(file.path, start.offset, chunkSize);
  const tailAbandoned = start.offset + chunk.length === file.size && now.getTime() - file.mtimeMs >= ABANDONED_LINE_MS;
  const readableLength = tailAbandoned ? chunk.length : chunk.lastIndexOf(NEWLINE) + 1;
  if (readableLength === 0) {
    const lineTooLong = chunk.length >= longestReadableLine;
    return { size: file.size, offset: start.offset + (lineTooLong ? chunk.length : 0), state: start.state, buckets: start.buckets };
  }

  const bucketsByKey = new Map(start.buckets.map((bucket) => [bucketKey(bucket), bucket]));
  for (const line of chunk.subarray(0, readableLength).toString("utf8").split("\n")) {
    if (!COUNTED_LINE_MARKERS.some((marker) => line.includes(marker))) continue;
    const parsed = parseLineOrNull(line);
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

function readChunk(path: string, position: number, length: number): Promise<Buffer> {
  return withFile(path, (handle) => readAt(handle, position, length));
}

async function withFile<T>(path: string, use: (handle: FileHandle) => Promise<T>): Promise<T> {
  const handle = await open(path, "r");
  try {
    return await use(handle);
  } finally {
    await handle.close();
  }
}

async function readAt(handle: FileHandle, position: number, length: number): Promise<Buffer> {
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await handle.read(buffer, 0, length, position);
  return buffer.subarray(0, bytesRead);
}

function parseLineOrNull(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
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
