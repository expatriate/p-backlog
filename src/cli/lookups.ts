import { basename } from "node:path";
import type { Project, Task } from "../core/model/types";
import { coreMessages } from "../core/messages";
import { createProject } from "../core/store/create";
import type { LoadedBacklog } from "../core/store/load";
import { PROJECT_FILE } from "../core/store/paths";
import { findGitRoots, findProjectForDir } from "../core/store/resolve-project";
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
  const brokenProjectFiles = loaded.errors.filter((error) => basename(error.path) === PROJECT_FILE);
  if (brokenProjectFiles.length > 0) {
    const core = coreMessages(io.language);
    for (const error of brokenProjectFiles) io.warn(cliMessages(io.language).projectNotCreatedFileUnparsed(error.path, core.problems(error.problems)));
    return undefined;
  }
  const created = await createProject(io.backlogRoot, gitRoots.main, loaded.projects);
  io.warn(cliMessages(io.language).projectCreated(created.id, created.prefix));
  return created;
}

function findProject(loaded: LoadedBacklog, io: CliIo, explicitId: string | undefined): Project | undefined {
  return explicitId === undefined
    ? findProjectForDir(loaded.projects, io.cwd, io.home)
    : loaded.projects.find((project) => project.id === explicitId);
}
