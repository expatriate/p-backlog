import { basename } from "node:path";
import { sourcePresence, type RepoLookup, type SourcePresence } from "../core/check/project-repo";
import { oncePerPath, warnPathErrors, type PathErrorHandler } from "../core/errors";
import type { CoreMessages } from "../core/messages";
import { ID_PATTERN } from "../core/model/ids";
import type { ParseError, Project, Task } from "../core/model/types";
import { createProject } from "../core/store/create";
import { unparsedProjectFileOf, unparsedProjectFiles, type LoadedBacklog } from "../core/store/load";
import { taskFileName } from "../core/store/paths";
import { lookupProjectForDir, readGitRoots, repoRootsOf, type DirGitRoots, type GitRoots, type KnownProjects, type ProjectLookup, type RepoPlaces } from "../core/store/resolve-project";
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

function lookupCwdProject(known: KnownProjects, io: CliIo): ProjectLookup {
  return lookupProjectForDir(known, io.cwd, cwdDirRoots(io), repoPlaces(io));
}

export function cwdBelongsTo(project: Project, known: KnownProjects, io: CliIo): boolean {
  const lookup = lookupCwdProject(known, io);
  return "project" in lookup && lookup.project.id === project.id;
}

export function repoLookup(io: CliIo): RepoLookup {
  return { ...repoPlaces(io), workingRoots: cwdGitRoots(io) };
}

export async function sourcePresenceOrWarn(io: CliIo, repo: string, source: string): Promise<SourcePresence> {
  const presence = await sourcePresence(repo, source, repoPlaces(io).onUnreadable);
  const warning = sourcePresenceWarning(io, presence, repo, source);
  if (warning !== null) io.warn(warning);
  return presence;
}

function sourcePresenceWarning(io: CliIo, presence: SourcePresence, repo: string, source: string): string | null {
  switch (presence.kind) {
    case "present":
      return null;
    case "missing":
      return io.cli.sourceFileMissing(source);
    case "unchecked":
      return io.cli.sourceFileUnchecked(source);
    case "unsafe-repo":
      return io.cli.sourceFileUncheckedUnsafeRepo(source, io.core.unsafeRepo(repo, presence.trustCommand));
  }
}

export async function findTaskOrWarn(loaded: LoadedBacklog, io: CliIo, id: string): Promise<Task | undefined> {
  const task = loaded.tasks.find((candidate) => candidate.id === id);
  if (task) return task;
  io.warn(missingTaskMessage(loaded, io, id));
  return undefined;
}

function missingTaskMessage(loaded: LoadedBacklog, io: CliIo, id: string): string {
  if (!ID_PATTERN.test(id)) return io.cli.taskNotFound(id);
  const fileName = taskFileName(id);
  const broken = loaded.errors.find((error) => basename(error.path) === fileName);
  if (broken) return io.cli.taskFileUnparsed(id, io.core.problems(broken.problems));
  const hidingProject = unparsedProjectFiles(loaded.errors).find((error) => error.hiddenTasks.includes(id));
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
  const lookup = lookupCwdProject(loaded, io);
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
  const lookup = lookupCwdProject(loaded, io);
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
