import { open, stat } from "node:fs/promises";
import { join } from "node:path";
import { attributeLine, newTranscriptState } from "../stats/cost/attribute";
import type { TokenCounts, TranscriptState, UsageBucket } from "../stats/types";
import { listDir } from "../store/fs-utils";
import { USAGE_CACHE_VERSION, type UsageCache, type UsageCacheEntry } from "./usage-cache";

export type TranscriptFile = { path: string; size: number };

export type ScanTranscriptsInput = {
  files: readonly TranscriptFile[];
  cache: UsageCache;
  byteBudget: number;
};

export type ScanTranscriptsResult = { cache: UsageCache; bytesRead: number; bytesLeft: number; filesDone: number };

const NEWLINE = 0x0a;
const COUNTED_LINE_MARKERS = ['"type":"assistant"', '"type":"user"'];

export async function listTranscripts(claudeProjectsDir: string): Promise<TranscriptFile[]> {
  const files: TranscriptFile[] = [];
  for (const projectEntry of await listDir(claudeProjectsDir)) {
    if (!projectEntry.isDirectory()) continue;
    const projectDir = join(claudeProjectsDir, projectEntry.name);
    for (const entry of await listDir(projectDir)) {
      const entryPath = join(projectDir, entry.name);
      if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        files.push(...(await withSize(entryPath)));
        continue;
      }
      if (!entry.isDirectory()) continue;
      const subagentsDir = join(entryPath, "subagents");
      for (const subagentEntry of await listDir(subagentsDir)) {
        if (subagentEntry.isFile() && subagentEntry.name.endsWith(".jsonl")) files.push(...(await withSize(join(subagentsDir, subagentEntry.name))));
      }
    }
  }
  return files;
}

async function withSize(path: string): Promise<TranscriptFile[]> {
  try {
    return [{ path, size: (await stat(path)).size }];
  } catch {
    return [];
  }
}

type ScanStart = { offset: number; state: TranscriptState; buckets: UsageBucket[] };

export async function scanTranscripts({ files, cache, byteBudget }: ScanTranscriptsInput): Promise<ScanTranscriptsResult> {
  let remainingBudget = byteBudget;
  const resultFiles: Record<string, UsageCacheEntry> = {};

  for (const file of files) {
    const previous = cache.files[file.path];
    const resumable = previous !== undefined && file.size >= previous.size;
    const start: ScanStart = resumable ? { offset: previous.offset, state: structuredClone(previous.state), buckets: previous.buckets } : { offset: 0, state: newTranscriptState(), buckets: [] };

    const chunkSize = Math.min(file.size - start.offset, remainingBudget);
    resultFiles[file.path] = await scanChunk(file, start, chunkSize);
    if (chunkSize > 0) {
      remainingBudget -= chunkSize;
      await yieldToEventLoop();
    }
  }

  return {
    cache: { version: USAGE_CACHE_VERSION, files: resultFiles },
    bytesRead: byteBudget - remainingBudget,
    bytesLeft: Object.values(resultFiles).reduce((sum, entry) => sum + (entry.size - entry.offset), 0),
    filesDone: Object.values(resultFiles).filter((entry) => entry.offset === entry.size).length,
  };
}

async function scanChunk(file: TranscriptFile, start: ScanStart, chunkSize: number): Promise<UsageCacheEntry> {
  if (chunkSize <= 0) return { size: file.size, offset: start.offset, state: start.state, buckets: start.buckets };

  const chunk = await readChunk(file.path, start.offset, chunkSize);
  const lastNewline = chunk.lastIndexOf(NEWLINE);
  if (lastNewline === -1) return { size: file.size, offset: start.offset, state: start.state, buckets: start.buckets };

  const bucketsByKey = new Map(start.buckets.map((bucket) => [bucketKey(bucket), bucket]));
  for (const line of chunk.subarray(0, lastNewline).toString("utf8").split("\n")) {
    if (!COUNTED_LINE_MARKERS.some((marker) => line.includes(marker))) continue;
    const parsed = parseLineOrNull(line);
    if (parsed === null) continue;
    for (const addition of attributeLine(parsed, start.state)) {
      const key = bucketKey(addition);
      const existing = bucketsByKey.get(key);
      bucketsByKey.set(key, existing === undefined ? addition : combineBuckets(existing, addition));
    }
  }

  return { size: file.size, offset: start.offset + lastNewline + 1, state: start.state, buckets: [...bucketsByKey.values()] };
}

async function readChunk(path: string, position: number, length: number): Promise<Buffer> {
  const handle = await open(path, "r");
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, position);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
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

function bucketKey(bucket: UsageBucket): string {
  return JSON.stringify([bucket.day, bucket.cwd, bucket.model, bucket.kind]);
}

function combineBuckets(existing: UsageBucket, addition: UsageBucket): UsageBucket {
  return { ...existing, tokens: combineTokens(existing.tokens, addition.tokens), hookTurns: existing.hookTurns + addition.hookTurns };
}

function combineTokens(a: TokenCounts, b: TokenCounts): TokenCounts {
  return { input: a.input + b.input, cacheWrite5m: a.cacheWrite5m + b.cacheWrite5m, cacheWrite1h: a.cacheWrite1h + b.cacheWrite1h, cacheRead: a.cacheRead + b.cacheRead, output: a.output + b.output };
}
