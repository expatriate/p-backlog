import { join } from "node:path";
import { z } from "zod";
import type { FixCommit, RepoCode } from "../stats/types";
import { readJsonFile, writeFileAtomic } from "../store/fs-utils";

export const CODE_CACHE_FILE = ".code-cache.json";
const CODE_CACHE_VERSION = 1;

export type CodeCacheSnapshot = { repos: Record<string, { key: string; code: RepoCode }>; fixes: Record<string, FixCommit> };

export type CodeCacheStore = { read: () => Promise<CodeCacheSnapshot>; write: (snapshot: CodeCacheSnapshot) => Promise<void> };

const repoCodeSchema = z.object({
  commits: z.array(z.array(z.string())),
  lines: z.array(z.object({ path: z.string(), lines: z.number() })),
  units: z.array(z.object({ date: z.string(), lines: z.number() })),
});

const fixCommitSchema = z.object({ date: z.string(), byAgent: z.boolean(), lines: z.number(), testLines: z.number() });

const snapshotSchema = z.object({
  version: z.literal(CODE_CACHE_VERSION),
  repos: z.record(z.string(), z.object({ key: z.string(), code: repoCodeSchema })),
  fixes: z.record(z.string(), fixCommitSchema),
});

export function emptyCodeCache(): CodeCacheSnapshot {
  return { repos: {}, fixes: {} };
}

export function createCodeCacheFile(root: string): CodeCacheStore {
  const path = join(root, CODE_CACHE_FILE);
  return {
    read: async () => {
      const snapshot = await readJsonFile(path, snapshotSchema);
      return snapshot === null ? emptyCodeCache() : { repos: snapshot.repos, fixes: snapshot.fixes };
    },
    write: (snapshot) => writeFileAtomic(path, JSON.stringify({ version: CODE_CACHE_VERSION, ...snapshot })),
  };
}
