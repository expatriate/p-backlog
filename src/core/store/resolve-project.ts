import { realpathSync } from "node:fs";
import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { runGit, runGitSync } from "../git/run";
import type { Project } from "../model/types";
import { expandHome } from "./paths";

export type GitRoots = { worktree: string; main: string };

export type RepoRootLookup = (dir: string) => Promise<GitRoots | null>;

const REPO_ROOT_TTL_MS = 60_000;
const SHOW_ROOTS = ["rev-parse", "--show-toplevel", "--git-dir", "--git-common-dir"];
const LIST_WORKTREES = ["worktree", "list", "--porcelain"];

type RevParse = { topLevel: string; isMainWorktree: boolean };

export function findGitRoots(dir: string): GitRoots | null {
  const parsed = parseRevParse(dir, runGitSync(dir, SHOW_ROOTS));
  if (parsed === null) return null;
  const main = parsed.isMainWorktree ? parsed.topLevel : (mainWorktreeIn(runGitSync(dir, LIST_WORKTREES)) ?? parsed.topLevel);
  return canonicalRoots(parsed.topLevel, main);
}

export function checkoutOf(repo: string, workingDir: string): string | null {
  const roots = findGitRoots(workingDir);
  return roots !== null && roots.main === realpathOrNull(repo) ? roots.worktree : null;
}

export function cachedRepoRoots({ ttlMs = REPO_ROOT_TTL_MS, now = Date.now }: { ttlMs?: number; now?: () => number } = {}): RepoRootLookup {
  const known = new Map<string, { roots: Promise<GitRoots | null>; checkedAt: number }>();
  return (dir) => {
    const cached = known.get(dir);
    if (cached !== undefined && now() - cached.checkedAt < ttlMs) return cached.roots;
    const roots = rootsOrPlainDir(dir);
    known.set(dir, { roots, checkedAt: now() });
    return roots;
  };
}

async function rootsOrPlainDir(dir: string): Promise<GitRoots | null> {
  const parsed = parseRevParse(dir, await runGit(dir, SHOW_ROOTS));
  if (parsed === null) {
    const plain = await realpath(dir).catch(() => null);
    return plain === null ? null : { worktree: plain, main: plain };
  }
  const main = parsed.isMainWorktree ? parsed.topLevel : (mainWorktreeIn(await runGit(dir, LIST_WORKTREES)) ?? parsed.topLevel);
  return canonicalRoots(parsed.topLevel, main);
}

function parseRevParse(dir: string, output: string | null): RevParse | null {
  const [topLevel = "", gitDir = "", commonDir = ""] = (output ?? "").split("\n").map((line) => line.trim());
  if (topLevel === "") return null;
  const isMainWorktree = commonDir === "" || realpathOrNull(resolve(dir, gitDir)) === realpathOrNull(resolve(dir, commonDir));
  return { topLevel, isMainWorktree };
}

function mainWorktreeIn(porcelain: string | null): string | null {
  const [first = ""] = (porcelain ?? "").split("\n\n");
  const lines = first.split("\n");
  const path = lines.find((line) => line.startsWith("worktree "))?.slice("worktree ".length);
  return path === undefined || lines.includes("bare") ? null : path;
}

function canonicalRoots(worktreePath: string, mainPath: string): GitRoots | null {
  const worktree = realpathOrNull(worktreePath);
  const main = realpathOrNull(mainPath);
  return worktree === null || main === null ? null : { worktree, main };
}

export function findProjectForDir(projects: readonly Project[], dir: string, home: string): Project | undefined {
  const roots = findGitRoots(dir);
  if (roots !== null) return findProjectForRoots(projects, roots, home);
  const plain = realpathOrNull(dir);
  return plain === null ? undefined : findProjectForRoots(projects, { worktree: plain, main: plain }, home);
}

export function findProjectForRoots(projects: readonly Project[], { worktree, main }: GitRoots, home: string): Project | undefined {
  const matches = projects.flatMap((project) =>
    project.repos.flatMap((repo) => {
      const repoPath = realpathOrNull(expandHome(repo, home));
      return repoPath !== null && (isSameOrInside(worktree, repoPath) || isSameOrInside(main, repoPath)) ? [{ project, repoPath }] : [];
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
