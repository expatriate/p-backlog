import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { transcriptStateSchema, usageBucketSchema } from "../stats/cost/usage-state";
import { readJsonFile, writeFileAtomic } from "../store/fs-utils";

const USAGE_CACHE_FILE = ".usage-cache.json";

export const USAGE_CACHE_VERSION = 6;

const usageCacheEntrySchema = z.object({
  size: z.number(),
  mtimeMs: z.number().optional(),
  offset: z.number(),
  fingerprint: z.string(),
  state: transcriptStateSchema,
  buckets: z.array(usageBucketSchema),
});

const usageCacheSchema = z.object({
  version: z.literal(USAGE_CACHE_VERSION),
  files: z.record(z.string(), usageCacheEntrySchema),
});

export type UsageCacheEntry = z.infer<typeof usageCacheEntrySchema>;
export type UsageCache = z.infer<typeof usageCacheSchema>;

export function emptyUsageCache(): UsageCache {
  return { version: USAGE_CACHE_VERSION, files: {} };
}

export async function readUsageCache(root: string): Promise<UsageCache> {
  return (await readJsonFile(join(root, USAGE_CACHE_FILE), usageCacheSchema)) ?? emptyUsageCache();
}

export async function writeUsageCache(root: string, cache: UsageCache): Promise<void> {
  await mkdir(root, { recursive: true });
  await writeFileAtomic(join(root, USAGE_CACHE_FILE), JSON.stringify(cache));
}
