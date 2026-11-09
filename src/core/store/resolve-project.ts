import { basename, dirname, resolve } from "node:path";
import type { PathErrorHandler } from "../errors";
import { runGit, runGitSync } from "../git/run";
import { projectIdBase } from "../model/ids";
import type { ParseError, Project, ProjectFileError } from "../model/types";
import { attemptReportingFailure, attemptReportingFailureSync, realpathOrNull } from "./fs-utils";
import { unparsedProjectFiles } from "./load";
import { expandHome, relativeInside } from "./paths";

export type GitRoots = { worktree: string; main: string };

export type RepoPlaces = { home: string; onUnreadable: PathErrorHandler };

export type RepoRootLookup = (dir: string) => Promise<DirGitRoots>;

const REPO_ROOT_TTL_MS = 60_000;
const SHOW_ROOTS = ["rev-parse", "--show-toplevel", "--git-dir", "--git-common-dir"];
const LIST_WORKTREES = ["worktree", "list", "--porcelain"];

type RevParse = { topLevel: string; isMainWorktree: boolean };

function findGitRoots(dir: string): GitRoots | null {
  const parsed = parseRevParse(dir, runGitSync(dir, SHOW_ROOTS));
  if (parsed === null) return null;
  return rootsOf(parsed, parsed.isMainWorktree ? null : runGitSync(dir, LIST_WORKTREES));
}

async function findGitRootsAsync(dir: string): Promise<GitRoots | null> {
  const parsed = parseRevParse(dir, await runGit(dir, SHOW_ROOTS));
  if (parsed === null) return null;
  return rootsOf(parsed, parsed.isMainWorktree ? null : await runGit(dir, LIST_WORKTREES));
}

type RepoRootCacheOptions = { onUnreadable: PathErrorHandler; ttlMs?: number; now?: () => number };

export function cachedRepoRoots({ onUnreadable, ttlMs = REPO_ROOT_TTL_MS, now = Date.now }: RepoRootCacheOptions): RepoRootLookup {
  const known = new Map<string, { roots: Promise<DirGitRoots>; checkedAt: number }>();
  const isFresh = ({ checkedAt }: { checkedAt: number }) => now() - checkedAt < ttlMs;
  return (dir) => {
    const cached = known.get(dir);
    if (cached !== undefined && isFresh(cached)) return cached.roots;
    for (const [knownDir, entry] of known) if (!isFresh(entry)) known.delete(knownDir);
    const roots = attemptReportingFailure(dir, async (path) => (await findGitRootsAsync(path)) ?? "not-in-repo", onUnreadable).then((found) => found ?? "unreadable");
    known.set(dir, { roots, checkedAt: now() });
    return roots;
  };
}

function rootsOf({ topLevel }: RevParse, worktreeList: string | null): GitRoots | null {
  return canonicalRoots(topLevel, mainWorktreeIn(worktreeList) ?? topLevel);
}

function plainDirRoots(dir: string): GitRoots | null {
  const path = realpathOrNull(dir);
  return path === null ? null : { worktree: path, main: path };
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

export type DirGitRoots = GitRoots | "not-in-repo" | "unreadable";

export function readGitRoots(dir: string, onUnreadable: PathErrorHandler): DirGitRoots {
  return attemptReportingFailureSync(dir, (path) => findGitRoots(path) ?? "not-in-repo", onUnreadable) ?? "unreadable";
}

export function repoRootsOf(dirRoots: DirGitRoots): GitRoots | null {
  return typeof dirRoots === "string" ? null : dirRoots;
}

export type KnownProjects = { projects: readonly Project[]; errors: readonly ParseError[] };

export type ProjectLookup = { project: Project } | { broken: ProjectFileError[] };

export function lookupProjectForDir(known: KnownProjects, dir: string, dirRoots: DirGitRoots, places: RepoPlaces): ProjectLookup {
  const roots = matchingRoots(dir, dirRoots, places);
  if (roots === null) return { broken: [] };
  const repo = repoRootsOf(dirRoots);
  return lookupProject(known, { roots, repoDirName: repo === null ? undefined : projectIdBase(basename(repo.main)) }, places);
}

type DirRepo = { roots: GitRoots; repoDirName: string | undefined };

function lookupProject({ projects, errors }: KnownProjects, { roots, repoDirName }: DirRepo, places: RepoPlaces): ProjectLookup {
  const coveredLength = (repos: readonly string[]) => closestCoveringRepo(repos, roots, places)?.length ?? 0;
  const coverageOf = (error: ProjectFileError) => {
    const namedAfterRepo = error.claimedRepos.length === 0 && error.projectId === repoDirName;
    return { error, length: namedAfterRepo ? roots.main.length : coveredLength(error.claimedRepos) };
  };
  const covering = unparsedProjectFiles(errors)
    .map(coverageOf)
    .filter(({ length }) => length > 0);
  const project = findProjectForRoots(projects, roots, places);
  const projectLength = project === undefined ? 0 : coveredLength(project.repos);
  if (project !== undefined && covering.every(({ length }) => length <= projectLength)) return { project };
  return { broken: covering.map(({ error }) => error) };
}

function matchingRoots(dir: string, dirRoots: DirGitRoots, places: RepoPlaces): GitRoots | null {
  if (dirRoots === "unreadable") return null;
  return dirRoots === "not-in-repo" ? attemptReportingFailureSync(dir, plainDirRoots, places.onUnreadable) : dirRoots;
}

function findProjectForRoots(projects: readonly Project[], roots: GitRoots, places: RepoPlaces): Project | undefined {
  const matches = projects.flatMap((project) => {
    const repoPath = closestCoveringRepo(project.repos, roots, places);
    return repoPath === undefined ? [] : [{ project, repoPath }];
  });
  return matches.sort((a, b) => b.repoPath.length - a.repoPath.length)[0]?.project;
}

export function pathFromProjectRepo(project: Project, roots: GitRoots, places: RepoPlaces, path: string): string | null {
  const repoPath = closestCoveringRepo(project.repos, roots, places);
  if (repoPath === undefined) return null;
  const enclosingRootsOf = (dir: string) => repoRootsOf(readGitRoots(dirname(dir), places.onUnreadable));
  return relativeInside(repoPath, asInProjectRepoCheckout(path, roots, { repoPath, enclosingRootsOf }));
}

type CheckoutClimb = { repoPath: string; enclosingRootsOf: (dir: string) => GitRoots | null };

function asInProjectRepoCheckout(path: string, roots: GitRoots, { repoPath, enclosingRootsOf }: CheckoutClimb): string {
  const passedMains = new Set<string>();
  let enclosing: GitRoots | null = roots;
  let translated = path;
  while (enclosing !== null && isSameOrInside(enclosing.main, repoPath) && !passedMains.has(enclosing.main)) {
    passedMains.add(enclosing.main);
    translated = asInMainCheckout(enclosing, translated);
    enclosing = enclosing.main === repoPath ? null : enclosingRootsOf(enclosing.main);
  }
  return translated;
}

function asInMainCheckout({ worktree, main }: GitRoots, path: string): string {
  const inWorktree = relativeInside(worktree, path);
  return inWorktree === null ? path : resolve(main, inWorktree);
}

function closestCoveringRepo(repos: readonly string[], roots: GitRoots, places: RepoPlaces): string | undefined {
  const covering = repos.map((repo) => resolvedRepo(repo, places)).filter((repoPath): repoPath is string => repoPath !== null && repoCovers(repoPath, roots));
  return covering.sort((a, b) => b.length - a.length)[0];
}

function repoCovers(repoPath: string, { worktree, main }: GitRoots): boolean {
  return isSameOrInside(worktree, repoPath) || isSameOrInside(main, repoPath);
}

function isSameOrInside(path: string, container: string): boolean {
  return relativeInside(container, path) !== null;
}

function resolvedRepo(repo: string, { home, onUnreadable }: RepoPlaces): string | null {
  return attemptReportingFailureSync(expandHome(repo, home), realpathOrNull, onUnreadable);
}
