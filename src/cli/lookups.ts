import { basename, dirname, join } from "node:path";
import { sourcePresence, type RepoLookup, type SourcePresence } from "../core/check/project-repo";
import { oncePerPath, warnPathErrors, type PathErrorHandler } from "../core/errors";
import type { CoreMessages } from "../core/messages";
import { ID_PATTERN, projectIdBase } from "../core/model/ids";
import { reposOfUnparsed } from "../core/model/project-file";
import type { ParseError, Project, Task } from "../core/model/types";
import { createProject } from "../core/store/create";
import { unparsedProjectFileOf, unparsedProjectFiles, type LoadedBacklog } from "../core/store/load";
import { taskFileName } from "../core/store/paths";
import { fileExists, readTextOrNull } from "../core/store/fs-utils";
import { closestCoveringRepo, findProjectForDir, findProjectForRoots, matchingRoots, readGitRoots, repoRootsOf, type DirGitRoots, type GitRoots, type RepoPlaces } from "../core/store/resolve-project";
import type { CliIo } from "./io";

export function warnUnreadableSkipped(warn: (line: string) => void, core: CoreMessages): PathErrorHandler {
  return warnPathErrors(warn, core.unreadableSkipped);
}

const placesOfRun = new WeakMap<CliIo, RepoPlaces>();

export function repoPlaces(io: CliIo): RepoPlaces {
  const known = placesOfRun.get(io);
  if (known !== undefined) return known;
  const places = { home: io.home, onUnreadable: oncePerPath(warnUnreadableSkipped(io.warn, io.core)) };
  placesOfRun.set(io, places);
  return places;
}

const cwdRootsOfRun = new WeakMap<CliIo, DirGitRoots>();

function cwdDirRoots(io: CliIo): DirGitRoots {
  const known = cwdRootsOfRun.get(io);
  if (known !== undefined) return known;
  const roots = readGitRoots(io.cwd, repoPlaces(io).onUnreadable);
  cwdRootsOfRun.set(io, roots);
  return roots;
}

export function cwdGitRoots(io: CliIo): GitRoots | null {
  return repoRootsOf(cwdDirRoots(io));
}

export function findProjectForCwd(projects: readonly Project[], io: CliIo): Project | undefined {
  return findProjectForDir(projects, io.cwd, cwdDirRoots(io), repoPlaces(io));
}

export function repoLookup(io: CliIo): RepoLookup {
  return { ...repoPlaces(io), workingRoots: cwdGitRoots(io) };
}

export async function sourcePresenceOrWarn(io: CliIo, repo: string, source: string): Promise<SourcePresence> {
  const presence = await sourcePresence(repo, source, repoPlaces(io).onUnreadable);
  if (presence === "missing") io.warn(io.cli.sourceFileMissing(source));
  if (presence === "unchecked") io.warn(io.cli.sourceFileUnchecked(source));
  return presence;
}

export async function findTaskOrWarn(loaded: LoadedBacklog, io: CliIo, id: string): Promise<Task | undefined> {
  const task = loaded.tasks.find((candidate) => candidate.id === id);
  if (task) return task;
  io.warn(await missingTaskMessage(loaded, io, id));
  return undefined;
}

async function missingTaskMessage(loaded: LoadedBacklog, io: CliIo, id: string): Promise<string> {
  if (!ID_PATTERN.test(id)) return io.cli.taskNotFound(id);
  const fileName = taskFileName(id);
  const broken = loaded.errors.find((error) => basename(error.path) === fileName);
  if (broken) return io.cli.taskFileUnparsed(id, io.core.problems(broken.problems));
  const brokenProjects = unparsedProjectFiles(loaded.errors);
  const holdsTask = await Promise.all(brokenProjects.map((error) => fileExists(join(dirname(error.path), fileName))));
  const hidingProject = brokenProjects.find((_, index) => holdsTask[index]);
  return hidingProject ? io.cli.taskOfUnparsedProject(id, hidingProject.path, io.core.problems(hidingProject.problems)) : io.cli.taskNotFound(id);
}

export function projectOf(loaded: LoadedBacklog, task: Task): Project | undefined {
  return loaded.projects.find((project) => project.id === task.projectId);
}

export async function findProjectOrWarn(loaded: LoadedBacklog, io: CliIo, explicitId: string | undefined): Promise<Project | undefined> {
  return explicitId === undefined ? findCwdProjectOrWarn(loaded, io) : findNamedProjectOrWarn(loaded, io, explicitId);
}

function findNamedProjectOrWarn(loaded: LoadedBacklog, io: CliIo, id: string): Project | undefined {
  const project = loaded.projects.find((candidate) => candidate.id === id);
  if (project) return project;
  const broken = unparsedProjectFileOf(loaded.errors, id);
  if (broken) warnUnparsedProjectFiles(io, [broken], io.cli.projectFileUnparsed);
  else io.warn(io.cli.projectNotFound(id));
  return undefined;
}

async function findCwdProjectOrWarn(loaded: LoadedBacklog, io: CliIo): Promise<Project | undefined> {
  const lookup = await lookupCwdProject(loaded, io);
  if ("project" in lookup) return lookup.project;
  if (lookup.broken.length > 0) warnUnparsedProjectFiles(io, lookup.broken, io.cli.projectFileUnparsed);
  else io.warn(io.cli.projectNotFoundForCwd(io.cwd));
  return undefined;
}

export function warnUnparsedProjectFiles(io: CliIo, errors: readonly ParseError[], message: (path: string, problems: string) => string): void {
  for (const error of errors) io.warn(message(error.path, io.core.problems(error.problems)));
}

export async function ensureProject(loaded: LoadedBacklog, io: CliIo, explicitId: string | undefined): Promise<Project | undefined> {
  if (explicitId !== undefined) return findNamedProjectOrWarn(loaded, io, explicitId);
  const lookup = await lookupCwdProject(loaded, io);
  if ("project" in lookup) return lookup.project;
  if (lookup.broken.length > 0) {
    warnUnparsedProjectFiles(io, lookup.broken, io.cli.projectNotCreatedFileUnparsed);
    return undefined;
  }
  const gitRoots = cwdDirRoots(io);
  if (gitRoots === "unreadable") return undefined;
  if (gitRoots === "not-in-repo") {
    io.warn(io.cli.notInGitRepo(io.cwd));
    return undefined;
  }
  const created = await createProject(io.backlogRoot, gitRoots.main, loaded.projects);
  io.warn(io.cli.projectCreated(created.id, created.prefix));
  return created;
}

type CoveringUnparsedFile = { error: ParseError; coveredRepoLength: number };

async function unparsedProjectFilesByCoverage(loaded: LoadedBacklog, roots: GitRoots, repoDirName: string | undefined, io: CliIo): Promise<CoveringUnparsedFile[]> {
  const coverageOf = async (error: ParseError): Promise<CoveringUnparsedFile> => {
    const repos = reposOfUnparsed((await readTextOrNull(error.path)) ?? "");
    const namedAfterRepo = repos.length === 0 && error.projectId === repoDirName;
    return { error, coveredRepoLength: namedAfterRepo ? roots.main.length : (closestCoveringRepo(repos, roots, repoPlaces(io))?.length ?? 0) };
  };
  return (await Promise.all(unparsedProjectFiles(loaded.errors).map(coverageOf))).filter(({ coveredRepoLength }) => coveredRepoLength > 0);
}

type CwdProjectLookup = { project: Project } | { broken: ParseError[] };

async function lookupCwdProject(loaded: LoadedBacklog, io: CliIo): Promise<CwdProjectLookup> {
  const roots = cwdMatchingRoots(io);
  if (roots === null) return { broken: [] };
  const repo = cwdGitRoots(io);
  const covering = await unparsedProjectFilesByCoverage(loaded, roots, repo === null ? undefined : projectIdBase(basename(repo.main)), io);
  const project = findProjectForRoots(loaded.projects, roots, repoPlaces(io));
  const projectRepoLength = project === undefined ? 0 : (closestCoveringRepo(project.repos, roots, repoPlaces(io))?.length ?? 0);
  if (project !== undefined && covering.every(({ coveredRepoLength }) => coveredRepoLength <= projectRepoLength)) return { project };
  return { broken: covering.map(({ error }) => error) };
}

function cwdMatchingRoots(io: CliIo): GitRoots | null {
  return matchingRoots(io.cwd, cwdDirRoots(io), repoPlaces(io));
}
