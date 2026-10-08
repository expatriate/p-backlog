import type { CodeCacheSnapshot } from "./code-cache";
import { churnWindowStart } from "./code-window";
import { repoOfFixKey, storedRepoFixKey, type RepoFixKey } from "./fix-key";
import type { RepoScan } from "./repo-scan";
import type { FixCommit } from "./types";

export type CodeMemory = { repos: Map<string, RepoScan>; fixes: Map<RepoFixKey, FixCommit>; unsettledCheckedAt: Map<RepoFixKey, string | null> };

export function emptyCodeMemory(): CodeMemory {
  return { repos: new Map(), fixes: new Map(), unsettledCheckedAt: new Map() };
}

export function snapshotOf({ repos, fixes, unsettledCheckedAt }: CodeMemory): CodeCacheSnapshot {
  return { repos: Object.fromEntries(repos), fixes: Object.fromEntries(fixes), unsettled: Object.fromEntries(unsettledCheckedAt) };
}

export function fillMissing(memory: CodeMemory, snapshot: CodeCacheSnapshot): void {
  for (const [repo, entry] of Object.entries(snapshot.repos)) if (!memory.repos.has(repo)) memory.repos.set(repo, entry);
  for (const [key, commit] of storedEntries(snapshot.fixes)) if (!memory.fixes.has(key)) memory.fixes.set(key, commit);
  for (const [key, main] of storedEntries(snapshot.unsettled)) if (!memory.unsettledCheckedAt.has(key)) memory.unsettledCheckedAt.set(key, main);
}

function storedEntries<T>(stored: Record<string, T>): [RepoFixKey, T][] {
  return Object.entries(stored).map(([key, value]) => [storedRepoFixKey(key), value]);
}

export function needsReading({ fixes, unsettledCheckedAt }: CodeMemory, key: RepoFixKey, main: string | null): boolean {
  const cached = fixes.get(key);
  return cached === undefined || (cached.landedAt === undefined && unsettledCheckedAt.get(key) !== main);
}

export function rememberFix({ fixes, unsettledCheckedAt }: CodeMemory, key: RepoFixKey, main: string | null, commit: FixCommit): void {
  if (commit.landedAt === undefined) {
    unsettledCheckedAt.set(key, main);
    if (!fixes.has(key)) fixes.set(key, commit);
  } else {
    unsettledCheckedAt.delete(key);
    fixes.set(key, commit);
  }
}

export function forgetStaleFixes(memory: CodeMemory, now: Date, requested: ReadonlySet<RepoFixKey>): void {
  const oldest = churnWindowStart(now).getTime();
  for (const [key, commit] of memory.fixes) {
    if (requested.has(key) || Date.parse(commit.date) >= oldest) continue;
    forgetFix(memory, key);
  }
}

export function keepOnlyRepos(memory: CodeMemory, kept: ReadonlySet<string>): void {
  for (const repo of memory.repos.keys()) if (!kept.has(repo)) memory.repos.delete(repo);
  for (const key of new Set([...memory.fixes.keys(), ...memory.unsettledCheckedAt.keys()])) if (!kept.has(repoOfFixKey(key))) forgetFix(memory, key);
}

function forgetFix(memory: CodeMemory, key: RepoFixKey): void {
  memory.fixes.delete(key);
  memory.unsettledCheckedAt.delete(key);
}
