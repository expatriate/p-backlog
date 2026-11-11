import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { transcriptStateSchema, usageBucketSchema, type UsageBucket } from "../stats/cost/usage-state";
import { readJsonFile } from "../store/json-file";
import { writeFileAtomic } from "../store/atomic-write";
import type { PathErrorHandler } from "../errors";

const USAGE_CACHE_FILE = ".usage-cache.json";

export const USAGE_CACHE_VERSION = 6;

const bucketsSchema = z.array(usageBucketSchema);

const usageCacheEntrySchema = z.object({
  size: z.number(),
  mtimeMs: z.number().optional(),
  offset: z.number(),
  fingerprint: z.string(),
  state: transcriptStateSchema,
  buckets: bucketsSchema,
});

const usageCacheSchema = z.object({
  version: z.literal(USAGE_CACHE_VERSION),
  files: z.record(z.string(), usageCacheEntrySchema),
  carried: z.record(z.string(), bucketsSchema).default({}),
});

const salvagedEntrySchema = z.object({ buckets: bucketsSchema }).transform((entry) => entry.buckets);

const salvagedCacheSchema = z
  .object({
    files: z.record(z.string(), salvagedEntrySchema.nullable().catch(null)).catch({}),
    carried: z.record(z.string(), bucketsSchema.nullable().catch(null)).catch({}),
  })
  .transform(({ files, carried }): UsageCache => {
    const salvaged = [...Object.entries(carried), ...Object.entries(files)].flatMap(([path, buckets]) => (buckets === null ? [] : [[path, buckets] as const]));
    return { ...emptyUsageCache(), carried: Object.fromEntries(salvaged) };
  });

const storedCacheSchema = z.union([usageCacheSchema, salvagedCacheSchema]);

export type UsageCacheEntry = z.infer<typeof usageCacheEntrySchema>;
export type UsageCache = z.infer<typeof usageCacheSchema>;

export function emptyUsageCache(): UsageCache {
  return { version: USAGE_CACHE_VERSION, files: {}, carried: {} };
}

export function usageBucketsOf(cache: UsageCache): UsageBucket[] {
  return [...Object.values(cache.files).flatMap((entry) => entry.buckets), ...Object.values(cache.carried).flat()];
}

export async function readUsageCache(root: string): Promise<UsageCache> {
  return (await readJsonFile(join(root, USAGE_CACHE_FILE), storedCacheSchema)) ?? emptyUsageCache();
}

export async function writeUsageCache(root: string, cache: UsageCache, onErrorAfterPublish: PathErrorHandler): Promise<void> {
  await mkdir(root, { recursive: true });
  await writeFileAtomic(join(root, USAGE_CACHE_FILE), JSON.stringify(cache), { onErrorAfterPublish });
}
