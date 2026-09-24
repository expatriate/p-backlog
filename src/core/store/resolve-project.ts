import { realpathSync } from "node:fs";
import { realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { runGit, runGitSync } from "../git/run";
import type { Project } from "../model/types";
import { expandHome } from "./paths";

export type RepoRootLookup = (dir: string) => Promise<string | null>;

export type GitRoots = { worktree: string; main: string };

const REPO_ROOT_TTL_MS = 60_000;
const SHOW_ROOTS = ["rev-parse", "--show-toplevel", "--git-common-dir"];

export function findGitRoots(dir: string): GitRoots | null {
  const roots = parseRoots(dir, runGitSync(dir, SHOW_ROOTS));
  if (roots === null) return null;
  const worktree = realpathOrNull(roots.worktree);
  const main = realpathOrNull(roots.main);
  return worktree === null || main === null ? null : { worktree, main };
}

export function cachedRepoRoots({ ttlMs = REPO_ROOT_TTL_MS, now = Date.now }: { ttlMs?: number; now?: () => number } = {}): RepoRootLookup {
  const known = new Map<string, { root: Promise<string | null>; checkedAt: number }>();
  return (dir) => {
    const cached = known.get(dir);
    if (cached !== undefined && now() - cached.checkedAt < ttlMs) return cached.root;
    const root = mainRootOrNull(dir);
    known.set(dir, { root, checkedAt: now() });
    return root;
  };
}

async function mainRootOrNull(dir: string): Promise<string | null> {
  const roots = parseRoots(dir, await runGit(dir, SHOW_ROOTS));
  return realpath(roots?.main ?? dir).catch(() => null);
}

function parseRoots(dir: string, output: string | null): GitRoots | null {
  const [topLevel = "", commonDir = ""] = (output ?? "").split("\n").map((line) => line.trim());
  if (topLevel === "") return null;
  const commonPath = resolve(dir, commonDir);
  return { worktree: topLevel, main: commonDir !== "" && basename(commonPath) === ".git" ? dirname(commonPath) : topLevel };
}

export function findProjectForDir(projects: readonly Project[], dir: string, home: string): Project | undefined {
  const roots = findGitRoots(dir);
  if (roots === null) return findProjectForRepoRoot(projects, realpathSync.native(dir), home);
  return findProjectForRepoRoot(projects, roots.worktree, home) ?? findProjectForRepoRoot(projects, roots.main, home);
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
    return realpathSync.native(path);
  } catch {
    return null;
  }
}
