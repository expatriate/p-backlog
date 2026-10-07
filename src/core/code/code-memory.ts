import type { CodeCacheSnapshot } from "./code-cache";
import { churnWindowStart } from "./code-window";
import type { RepoScan } from "./repo-scan";
import type { FixCommit } from "./types";

export type CodeMemory = { repos: Map<string, RepoScan>; fixes: Map<string, FixCommit>; unsettledCheckedAt: Map<string, string | null> };

export function emptyCodeMemory(): CodeMemory {
  return { repos: new Map(), fixes: new Map(), unsettledCheckedAt: new Map() };
}

export function snapshotOf({ repos, fixes, unsettledCheckedAt }: CodeMemory): CodeCacheSnapshot {
  return { repos: Object.fromEntries(repos), fixes: Object.fromEntries(fixes), unsettled: Object.fromEntries(unsettledCheckedAt) };
}

export function fillMissing(memory: CodeMemory, snapshot: CodeCacheSnapshot): void {
  for (const [repo, entry] of Object.entries(snapshot.repos)) if (!memory.repos.has(repo)) memory.repos.set(repo, entry);
  for (const [key, commit] of Object.entries(snapshot.fixes)) if (!memory.fixes.has(key)) memory.fixes.set(key, commit);
  for (const [key, main] of Object.entries(snapshot.unsettled)) if (!memory.unsettledCheckedAt.has(key)) memory.unsettledCheckedAt.set(key, main);
}

export function fixCacheKey(repo: string, hash: string): string {
  return `${repo} ${hash}`;
}

function repoOfFixCacheKey(key: string): string {
  return key.slice(0, key.lastIndexOf(" "));
}

export function needsReading({ fixes, unsettledCheckedAt }: CodeMemory, key: string, main: string | null): boolean {
  const cached = fixes.get(key);
  return cached === undefined || (cached.landedAt === undefined && unsettledCheckedAt.get(key) !== main);
}

export function rememberFix({ fixes, unsettledCheckedAt }: CodeMemory, key: string, main: string | null, commit: FixCommit): void {
  const checkedAt = commit.landedAt === undefined ? main : undefined;
  if (checkedAt === undefined) unsettledCheckedAt.delete(key);
  else unsettledCheckedAt.set(key, checkedAt);
  if (fixes.has(key) && commit.landedAt === undefined) return;
  fixes.set(key, commit);
}

export function forgetStaleFixes(memory: CodeMemory, now: Date, requested: ReadonlySet<string>): void {
  const oldest = churnWindowStart(now).getTime();
  for (const [key, commit] of memory.fixes) {
    if (requested.has(key) || Date.parse(commit.date) >= oldest) continue;
    forgetFix(memory, key);
  }
}

export function keepOnlyRepos(memory: CodeMemory, kept: ReadonlySet<string>): void {
  for (const repo of memory.repos.keys()) if (!kept.has(repo)) memory.repos.delete(repo);
  for (const key of new Set([...memory.fixes.keys(), ...memory.unsettledCheckedAt.keys()])) if (!kept.has(repoOfFixCacheKey(key))) forgetFix(memory, key);
}

function forgetFix(memory: CodeMemory, key: string): void {
  memory.fixes.delete(key);
  memory.unsettledCheckedAt.delete(key);
}
