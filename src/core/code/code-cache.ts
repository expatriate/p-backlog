import { join } from "node:path";
import { z } from "zod";
import type { FixCommit } from "../stats/types";
import { readJsonFile, writeFileAtomic } from "../store/fs-utils";
import type { RepoScan } from "./repo-scan";

export const CODE_CACHE_FILE = ".code-cache.json";
const CODE_CACHE_VERSION = 2;

export type CodeCacheSnapshot = { repos: Record<string, RepoScan>; fixes: Record<string, FixCommit>; unsettled: Record<string, string | null> };

export type CodeCacheStore = { read: () => Promise<CodeCacheSnapshot>; write: (snapshot: CodeCacheSnapshot) => Promise<void> };

const repoScanSchema: z.ZodType<RepoScan> = z.object({
  head: z.string(),
  main: z.string().nullable(),
  commits: z.array(z.object({ date: z.string(), paths: z.array(z.string()) })),
  units: z.array(z.object({ date: z.string(), lines: z.number() })),
  lines: z.array(z.object({ path: z.string(), lines: z.number() })),
});

const fixCommitSchema = z.object({ date: z.string(), landedAt: z.string().optional(), byAgent: z.boolean(), lines: z.number(), testLines: z.number() });

const snapshotSchema = z.object({
  version: z.literal(CODE_CACHE_VERSION),
  repos: z.record(z.string(), repoScanSchema),
  fixes: z.record(z.string(), fixCommitSchema),
  unsettled: z.record(z.string(), z.string().nullable()),
});

export function emptyCodeCache(): CodeCacheSnapshot {
  return { repos: {}, fixes: {}, unsettled: {} };
}

export function createCodeCacheFile(root: string): CodeCacheStore {
  const path = join(root, CODE_CACHE_FILE);
  return {
    read: async () => {
      const snapshot = await readJsonFile(path, snapshotSchema);
      return snapshot === null ? emptyCodeCache() : { repos: snapshot.repos, fixes: snapshot.fixes, unsettled: snapshot.unsettled };
    },
    write: (snapshot) => writeFileAtomic(path, JSON.stringify({ version: CODE_CACHE_VERSION, ...snapshot })),
  };
}
