import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { TranscriptState, UsageBucket } from "../stats/types";
import { readTextOrNull, writeFileAtomic } from "../store/fs-utils";

export const USAGE_CACHE_FILE = ".usage-cache.json";

export type UsageCacheEntry = { size: number; offset: number; state: TranscriptState; buckets: UsageBucket[] };
export const USAGE_CACHE_VERSION = 2;
export type UsageCache = { version: typeof USAGE_CACHE_VERSION; files: Record<string, UsageCacheEntry> };

const tokenCountsSchema = z.object({
  input: z.number(),
  cacheWrite5m: z.number(),
  cacheWrite1h: z.number(),
  cacheRead: z.number(),
  output: z.number(),
});

const usageBucketSchema = z.object({
  day: z.string(),
  cwd: z.string(),
  model: z.string(),
  kind: z.enum(["hook", "cli", "skill"]),
  tokens: tokenCountsSchema,
  hookTurns: z.number(),
});

const pendingEstimateSchema = z.object({
  kind: z.enum(["cli", "skill"]),
  chars: z.number(),
  day: z.string(),
  cwd: z.string(),
});

const transcriptStateSchema = z.object({
  hookOpen: z.boolean(),
  lastModel: z.string().nullable(),
  lastMessageId: z.string().nullable(),
  pending: z.record(z.string(), z.enum(["cli", "skill"])),
  pendingEstimates: z.array(pendingEstimateSchema),
});

const usageCacheEntrySchema = z.object({
  size: z.number(),
  offset: z.number(),
  state: transcriptStateSchema,
  buckets: z.array(usageBucketSchema),
});

const usageCacheSchema = z.object({
  version: z.literal(USAGE_CACHE_VERSION),
  files: z.record(z.string(), usageCacheEntrySchema),
});

export function emptyUsageCache(): UsageCache {
  return { version: USAGE_CACHE_VERSION, files: {} };
}

export async function readUsageCache(root: string): Promise<UsageCache> {
  const text = await readTextOrNull(join(root, USAGE_CACHE_FILE));
  if (text === null) return emptyUsageCache();
  try {
    const parsed = usageCacheSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : emptyUsageCache();
  } catch {
    return emptyUsageCache();
  }
}

export async function writeUsageCache(root: string, cache: UsageCache): Promise<void> {
  await mkdir(root, { recursive: true });
  await writeFileAtomic(join(root, USAGE_CACHE_FILE), JSON.stringify(cache));
}
