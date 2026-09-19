import { open, stat } from "node:fs/promises";
import { join } from "node:path";
import { attributeLine, newTranscriptState } from "../stats/cost/attribute";
import type { TokenCounts, TranscriptState, UsageBucket } from "../stats/types";
import { listDir } from "../store/fs-utils";
import type { UsageCache, UsageCacheEntry } from "./usage-cache";

export type TranscriptFile = { path: string; size: number };

export type ScanTranscriptsInput = {
  files: readonly TranscriptFile[];
  cache: UsageCache;
  projectOf: (cwd: string) => string | null;
  byteBudget: number;
};

export type ScanTranscriptsResult = { cache: UsageCache; bytesLeft: number; filesDone: number };

const NEWLINE = 0x0a;

export async function listTranscripts(claudeProjectsDir: string): Promise<TranscriptFile[]> {
  const files: TranscriptFile[] = [];
  for (const projectEntry of await listDir(claudeProjectsDir)) {
    if (!projectEntry.isDirectory()) continue;
    const projectDir = join(claudeProjectsDir, projectEntry.name);
    for (const entry of await listDir(projectDir)) {
      const entryPath = join(projectDir, entry.name);
      if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        files.push(await withSize(entryPath));
        continue;
      }
      if (!entry.isDirectory()) continue;
      const subagentsDir = join(entryPath, "subagents");
      for (const subagentEntry of await listDir(subagentsDir)) {
        if (subagentEntry.isFile() && subagentEntry.name.endsWith(".jsonl")) files.push(await withSize(join(subagentsDir, subagentEntry.name)));
      }
    }
  }
  return files;
}

async function withSize(path: string): Promise<TranscriptFile> {
  return { path, size: (await stat(path)).size };
}

type ScanStart = { offset: number; state: TranscriptState; buckets: UsageBucket[] };

export async function scanTranscripts({ files, cache, projectOf, byteBudget }: ScanTranscriptsInput): Promise<ScanTranscriptsResult> {
  let remainingBudget = byteBudget;
  const resultFiles: Record<string, UsageCacheEntry> = {};

  for (const file of files) {
    const previous = cache.files[file.path];
    const resumable = previous !== undefined && file.size >= previous.size;
    const start: ScanStart = resumable ? { offset: previous.offset, state: structuredClone(previous.state), buckets: previous.buckets } : { offset: 0, state: newTranscriptState(), buckets: [] };

    const chunkSize = Math.min(file.size - start.offset, remainingBudget);
    resultFiles[file.path] = await scanChunk(file, start, chunkSize, projectOf);
    if (chunkSize > 0) remainingBudget -= chunkSize;
  }

  return {
    cache: { version: 1, files: resultFiles },
    bytesLeft: Object.values(resultFiles).reduce((sum, entry) => sum + (entry.size - entry.offset), 0),
    filesDone: Object.values(resultFiles).filter((entry) => entry.offset === entry.size).length,
  };
}

async function scanChunk(file: TranscriptFile, start: ScanStart, chunkSize: number, projectOf: (cwd: string) => string | null): Promise<UsageCacheEntry> {
  if (chunkSize <= 0) return { size: file.size, offset: start.offset, state: start.state, buckets: start.buckets };

  const chunk = await readChunk(file.path, start.offset, chunkSize);
  const lastNewline = chunk.lastIndexOf(NEWLINE);
  if (lastNewline === -1) return { size: file.size, offset: start.offset, state: start.state, buckets: start.buckets };

  let mergedBuckets = start.buckets;
  for (const line of chunk.subarray(0, lastNewline).toString("utf8").split("\n")) {
    if (line.trim() === "") continue;
    const parsed = parseLineOrNull(line);
    if (parsed === null) continue;
    for (const addition of attributeLine(parsed, start.state, projectOf)) mergedBuckets = mergeBucket(mergedBuckets, addition);
  }

  return { size: file.size, offset: start.offset + lastNewline + 1, state: start.state, buckets: mergedBuckets };
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

function mergeBucket(buckets: UsageBucket[], addition: UsageBucket): UsageBucket[] {
  const index = buckets.findIndex((bucket) => bucket.day === addition.day && bucket.projectId === addition.projectId && bucket.model === addition.model && bucket.kind === addition.kind);
  if (index === -1) return [...buckets, addition];
  const existing = buckets[index] as UsageBucket;
  const combined: UsageBucket = { ...existing, tokens: combineTokens(existing.tokens, addition.tokens), hookTurns: existing.hookTurns + addition.hookTurns };
  return buckets.map((bucket, candidateIndex) => (candidateIndex === index ? combined : bucket));
}

function combineTokens(a: TokenCounts, b: TokenCounts): TokenCounts {
  return { input: a.input + b.input, cacheWrite5m: a.cacheWrite5m + b.cacheWrite5m, cacheWrite1h: a.cacheWrite1h + b.cacheWrite1h, cacheRead: a.cacheRead + b.cacheRead, output: a.output + b.output };
}
