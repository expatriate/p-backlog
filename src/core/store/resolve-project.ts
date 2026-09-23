import { realpathSync } from "node:fs";
import { realpath } from "node:fs/promises";
import { isAbsolute, relative, sep } from "node:path";
import { runGit, runGitSync } from "../git/run";
import type { Project } from "../model/types";
import { expandHome } from "./paths";

export type RepoRootLookup = (dir: string) => Promise<string | null>;

const REPO_ROOT_TTL_MS = 60_000;
const SHOW_TOP_LEVEL = ["rev-parse", "--show-toplevel"];

export function findRepoRoot(dir: string): string {
  return findGitRoot(dir) ?? realpathSync(dir);
}

export function findGitRoot(dir: string): string | null {
  const topLevel = topLevelOf(runGitSync(dir, SHOW_TOP_LEVEL));
  return topLevel === null ? null : realpathOrNull(topLevel);
}

export function cachedRepoRoots({ ttlMs = REPO_ROOT_TTL_MS, now = Date.now }: { ttlMs?: number; now?: () => number } = {}): RepoRootLookup {
  const known = new Map<string, { root: Promise<string | null>; checkedAt: number }>();
  return (dir) => {
    const cached = known.get(dir);
    if (cached !== undefined && now() - cached.checkedAt < ttlMs) return cached.root;
    const root = repoRootOrNull(dir);
    known.set(dir, { root, checkedAt: now() });
    return root;
  };
}

async function repoRootOrNull(dir: string): Promise<string | null> {
  const topLevel = topLevelOf(await runGit(dir, SHOW_TOP_LEVEL));
  return realpath(topLevel ?? dir).catch(() => null);
}

function topLevelOf(output: string | null): string | null {
  const topLevel = output?.trim() ?? "";
  return topLevel === "" ? null : topLevel;
}

export function findProjectForDir(projects: readonly Project[], dir: string, home: string): Project | undefined {
  return findProjectForRepoRoot(projects, findRepoRoot(dir), home);
}

export function findProjectForRepoRoot(projects: readonly Project[], root: string, home: string): Project | undefined {
  const matches = projects.flatMap((project) =>
    project.repos.flatMap((repo) => {
      const repoPath = realpathOrNull(expandHome(repo, home));
      return repoPath !== null && isSameOrInside(root, repoPath) ? [{ project, repoPath }] : [];
    }),
  );
  return matches.sort((a, b) => b.repoPath.length - a.repoPath.length)[0]?.project;
}

function isSameOrInside(path: string, container: string): boolean {
  const relation = relative(container, path);
  return relation === "" || (!isAbsolute(relation) && relation.split(sep)[0] !== "..");
}

function realpathOrNull(path: string): string | null {
  try {
    return realpathSync(path);
  } catch {
    return null;
  }
}
