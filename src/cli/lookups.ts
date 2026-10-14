import { basename, dirname } from "node:path";
import type { RepoLookup } from "../core/check/project-repo";
import { oncePerPath, warnPathErrors, type PathErrorHandler } from "../core/errors";
import type { CoreMessages } from "../core/messages";
import { projectIdBase } from "../core/model/ids";
import type { ParseError, Project, Task } from "../core/model/types";
import { createProject } from "../core/store/create";
import type { LoadedBacklog } from "../core/store/load";
import { PROJECT_FILE } from "../core/store/paths";
import { readTextOrNull } from "../core/store/fs-utils";
import { findProjectForDir, readGitRoots, repoRootsOf, type DirGitRoots, type GitRoots, type RepoPlaces } from "../core/store/resolve-project";
import type { CliIo } from "./io";
import { relativeInside } from "./path-inside";

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

export function findTaskOrWarn(loaded: LoadedBacklog, io: CliIo, id: string): Task | undefined {
  const task = loaded.tasks.find((candidate) => candidate.id === id);
  if (task) return task;
  const broken = loaded.errors.find((error) => basename(error.path) === `${id}.md`);
  io.warn(broken ? io.cli.taskFileUnparsed(id, io.core.problems(broken.problems)) : io.cli.taskNotFound(id));
  return undefined;
}

export function projectOf(loaded: LoadedBacklog, task: Task): Project | undefined {
  return loaded.projects.find((project) => project.id === task.projectId);
}

export function findProjectOrWarn(loaded: LoadedBacklog, io: CliIo, explicitId: string | undefined): Project | undefined {
  const project = findProject(loaded, io, explicitId);
  if (project) return project;
  io.warn(explicitId === undefined ? io.cli.projectNotFoundForCwd(io.cwd) : io.cli.projectNotFound(explicitId));
  return undefined;
}

export async function ensureProject(loaded: LoadedBacklog, io: CliIo, explicitId: string | undefined): Promise<Project | undefined> {
  if (explicitId !== undefined) return findProjectOrWarn(loaded, io, explicitId);
  const existing = findProject(loaded, io, undefined);
  if (existing) return existing;
  const gitRoots = cwdDirRoots(io);
  if (gitRoots === "unreadable") return undefined;
  if (gitRoots === "not-in-repo") {
    io.warn(io.cli.notInGitRepo(io.cwd));
    return undefined;
  }
  const brokenProjectFiles = await brokenProjectFilesOf(loaded, gitRoots, io.home);
  if (brokenProjectFiles.length > 0) {
    for (const error of brokenProjectFiles) io.warn(io.cli.projectNotCreatedFileUnparsed(error.path, io.core.problems(error.problems)));
    return undefined;
  }
  const created = await createProject(io.backlogRoot, gitRoots.main, loaded.projects);
  io.warn(io.cli.projectCreated(created.id, created.prefix));
  return created;
}

async function brokenProjectFilesOf(loaded: LoadedBacklog, roots: GitRoots, home: string): Promise<ParseError[]> {
  const repoPaths = [roots.main, roots.worktree].flatMap((path) => [path, homeRelative(path, home)]);
  const ownId = projectIdBase(basename(roots.main));
  const broken = loaded.errors.filter((error) => basename(error.path) === PROJECT_FILE);
  const texts = await Promise.all(broken.map(async (error) => (await readTextOrNull(error.path)) ?? ""));
  return broken.filter((error, position) => basename(dirname(error.path)) === ownId || repoPaths.some((path) => mentionsPath(texts[position] ?? "", path)));
}

const PATH_BOUNDARY = /[\s"',[\]]/;
const TRAILING_SEPARATORS = /^[\\/]*/;

function mentionsPath(text: string, path: string): boolean {
  for (let start = text.indexOf(path); start !== -1; start = text.indexOf(path, start + 1)) {
    const end = start + path.length + (TRAILING_SEPARATORS.exec(text.slice(start + path.length))?.[0].length ?? 0);
    if (isBoundary(text.charAt(start - 1)) && isBoundary(text.charAt(end))) return true;
  }
  return false;
}

function isBoundary(char: string): boolean {
  return char === "" || PATH_BOUNDARY.test(char);
}

function homeRelative(path: string, home: string): string {
  const inside = relativeInside(home, path);
  return inside === null ? path : `~/${inside}`;
}

function findProject(loaded: LoadedBacklog, io: CliIo, explicitId: string | undefined): Project | undefined {
  return explicitId === undefined ? findProjectForCwd(loaded.projects, io) : loaded.projects.find((project) => project.id === explicitId);
}
