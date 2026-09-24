import { basename, dirname, relative, sep } from "node:path";
import { deriveProjectId } from "../core/model/ids";
import type { ParseError, Project, Task } from "../core/model/types";
import { coreMessages } from "../core/messages";
import { createProject } from "../core/store/create";
import type { LoadedBacklog } from "../core/store/load";
import { PROJECT_FILE } from "../core/store/paths";
import { readTextOrNull } from "../core/store/fs-utils";
import { findGitRoots, findProjectForDir, type GitRoots } from "../core/store/resolve-project";
import type { CliIo } from "./io";
import { cliMessages } from "./messages";

export function requireTask(loaded: LoadedBacklog, io: CliIo, id: string): Task | undefined {
  const task = loaded.tasks.find((candidate) => candidate.id === id);
  if (task) return task;
  const broken = loaded.errors.find((error) => basename(error.path) === `${id}.md`);
  const cli = cliMessages(io.language);
  io.warn(broken ? cli.taskFileUnparsed(id, coreMessages(io.language).problems(broken.problems)) : cli.taskNotFound(id));
  return undefined;
}

export function projectOf(loaded: LoadedBacklog, task: Task): Project | undefined {
  return loaded.projects.find((project) => project.id === task.projectId);
}

export function requireProject(loaded: LoadedBacklog, io: CliIo, explicitId: string | undefined): Project | undefined {
  const project = findProject(loaded, io, explicitId);
  if (project) return project;
  const cli = cliMessages(io.language);
  io.warn(explicitId === undefined ? cli.projectNotFoundForCwd(io.cwd) : cli.projectNotFound(explicitId));
  return undefined;
}

export async function ensureProject(loaded: LoadedBacklog, io: CliIo, explicitId: string | undefined): Promise<Project | undefined> {
  if (explicitId !== undefined) return requireProject(loaded, io, explicitId);
  const existing = findProject(loaded, io, undefined);
  if (existing) return existing;
  const gitRoots = findGitRoots(io.cwd);
  if (gitRoots === null) {
    io.warn(cliMessages(io.language).notInGitRepo(io.cwd));
    return undefined;
  }
  const brokenProjectFiles = await brokenProjectFilesOf(loaded, gitRoots, io.home);
  if (brokenProjectFiles.length > 0) {
    const core = coreMessages(io.language);
    for (const error of brokenProjectFiles) io.warn(cliMessages(io.language).projectNotCreatedFileUnparsed(error.path, core.problems(error.problems)));
    return undefined;
  }
  const created = await createProject(io.backlogRoot, gitRoots.main, loaded.projects);
  io.warn(cliMessages(io.language).projectCreated(created.id, created.prefix));
  return created;
}

async function brokenProjectFilesOf(loaded: LoadedBacklog, roots: GitRoots, home: string): Promise<ParseError[]> {
  const repoPaths = [roots.main, roots.worktree].flatMap((path) => [path, homeRelative(path, home)]);
  const ownId = deriveProjectId(basename(roots.main), new Set());
  const broken = loaded.errors.filter((error) => basename(error.path) === PROJECT_FILE);
  const texts = await Promise.all(broken.map(async (error) => (await readTextOrNull(error.path)) ?? ""));
  return broken.filter((error, position) => basename(dirname(error.path)) === ownId || repoPaths.some((path) => texts[position]?.includes(path)));
}

function homeRelative(path: string, home: string): string {
  const inside = relative(home, path);
  return inside.startsWith("..") ? path : `~/${inside.split(sep).join("/")}`;
}

function findProject(loaded: LoadedBacklog, io: CliIo, explicitId: string | undefined): Project | undefined {
  return explicitId === undefined
    ? findProjectForDir(loaded.projects, io.cwd, io.home)
    : loaded.projects.find((project) => project.id === explicitId);
}
