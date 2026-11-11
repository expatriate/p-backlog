import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import type { PathErrorHandler } from "../errors";
import { runGit, runGitSync } from "../git/run";
import { projectIdBase } from "../model/ids";
import type { ParseError, Project, ProjectFileError } from "../model/types";
import { attemptReportingFailure, attemptReportingFailureSync, realpathOrNull } from "./fs-utils";
import { unparsedProjectFiles } from "./load";
import { expandHome, relativeInside } from "./paths";

export type GitRoots = { worktree: string; main: string };

export type RepoContext = { home: string; onUnreadable: PathErrorHandler };

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

type ExistingAncestor = { real: string; missing: string[] };

function nearestExistingAncestor(path: string): ExistingAncestor | null {
  const real = realpathOrNull(path);
  if (real !== null) return { real, missing: [] };
  const parent = dirname(path);
  if (parent === path || !isAbsolute(path)) return null;
  const ancestor = nearestExistingAncestor(parent);
  return ancestor === null ? null : { real: ancestor.real, missing: [...ancestor.missing, basename(path)] };
}

function realpathThroughExistingAncestor(path: string): string | null {
  const ancestor = nearestExistingAncestor(path);
  return ancestor === null ? null : join(ancestor.real, ...ancestor.missing);
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

type Canonicalize = (path: string) => string | null;

type LookupContext = RepoContext & { canonicalize: Canonicalize };

export function lookupProjectForDir(known: KnownProjects, dir: string, dirRoots: DirGitRoots, context: RepoContext): ProjectLookup {
  return lookupProjectCanonicalizing(known, dir, dirRoots, { ...context, canonicalize: realpathOrNull });
}

export async function lookupProjectForRecordedDir(known: KnownProjects, dir: string, lookupRepoRoot: RepoRootLookup, context: RepoContext): Promise<ProjectLookup> {
  const dirRoots = await lookupRepoRoot(dir);
  const byPath = lookupProjectCanonicalizing(known, dir, dirRoots, { ...context, canonicalize: realpathThroughExistingAncestor });
  if ("project" in byPath || byPath.broken.length > 0 || dirRoots !== "not-in-repo") return byPath;
  const ancestor = attemptReportingFailureSync(dir, nearestExistingAncestor, context.onUnreadable);
  if (ancestor === null || ancestor.missing.length === 0) return byPath;
  const ancestorRoots = await lookupRepoRoot(ancestor.real);
  return typeof ancestorRoots === "string" ? byPath : lookupProjectForDir(known, ancestor.real, ancestorRoots, context);
}

function lookupProjectCanonicalizing(known: KnownProjects, dir: string, dirRoots: DirGitRoots, context: LookupContext): ProjectLookup {
  const roots = matchingRoots(dir, dirRoots, context);
  if (roots === null) return { broken: [] };
  const repo = repoRootsOf(dirRoots);
  return lookupProject(known, { roots, repoDirName: repo === null ? undefined : projectIdBase(basename(repo.main)) }, context);
}

type DirRepo = { roots: GitRoots; repoDirName: string | undefined };

function lookupProject({ projects, errors }: KnownProjects, { roots, repoDirName }: DirRepo, context: LookupContext): ProjectLookup {
  const coveredLength = (repos: readonly string[]) => closestCoveringRepo(repos, roots, context)?.length ?? 0;
  const coverageOf = (error: ProjectFileError) => {
    const namedAfterRepo = error.claimedRepos.length === 0 && error.projectId === repoDirName;
    return { error, length: namedAfterRepo ? roots.main.length : coveredLength(error.claimedRepos) };
  };
  const covering = unparsedProjectFiles(errors)
    .map(coverageOf)
    .filter(({ length }) => length > 0);
  const project = findProjectForRoots(projects, roots, context);
  const projectLength = project === undefined ? 0 : coveredLength(project.repos);
  if (project !== undefined && covering.every(({ length }) => length <= projectLength)) return { project };
  return { broken: covering.map(({ error }) => error) };
}

function matchingRoots(dir: string, dirRoots: DirGitRoots, { canonicalize, onUnreadable }: LookupContext): GitRoots | null {
  if (dirRoots === "unreadable") return null;
  if (dirRoots !== "not-in-repo") return dirRoots;
  const path = attemptReportingFailureSync(dir, canonicalize, onUnreadable);
  return path === null ? null : { worktree: path, main: path };
}

function findProjectForRoots(projects: readonly Project[], roots: GitRoots, context: LookupContext): Project | undefined {
  const matches = projects.flatMap((project) => {
    const repoPath = closestCoveringRepo(project.repos, roots, context);
    return repoPath === undefined ? [] : [{ project, repoPath }];
  });
  return matches.sort((a, b) => b.repoPath.length - a.repoPath.length || Number(b.project.active) - Number(a.project.active))[0]?.project;
}

export function pathFromProjectRepo(project: Project, roots: GitRoots, context: RepoContext, path: string): string | null {
  const repoPath = closestCoveringRepo(project.repos, roots, { ...context, canonicalize: realpathOrNull });
  if (repoPath === undefined) return null;
  const enclosingRootsOf = (dir: string) => repoRootsOf(readGitRoots(dirname(dir), context.onUnreadable));
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

function closestCoveringRepo(repos: readonly string[], roots: GitRoots, context: LookupContext): string | undefined {
  const covering = repos.map((repo) => resolvedRepo(repo, context)).filter((repoPath): repoPath is string => repoPath !== null && repoCovers(repoPath, roots));
  return covering.sort((a, b) => b.length - a.length)[0];
}

function repoCovers(repoPath: string, { worktree, main }: GitRoots): boolean {
  return isSameOrInside(worktree, repoPath) || isSameOrInside(main, repoPath);
}

function isSameOrInside(path: string, container: string): boolean {
  return relativeInside(container, path) !== null;
}

function resolvedRepo(repo: string, { home, onUnreadable, canonicalize }: LookupContext): string | null {
  return attemptReportingFailureSync(expandHome(repo, home), canonicalize, onUnreadable);
}
