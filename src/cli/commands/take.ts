import { realpathSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { sourcePath } from "../../core/check/source-lines";
import { buildIndex, epicChildren, isClosed, openBlockers, type BacklogIndex } from "../../core/model/graph";
import { pickNextTask } from "../../core/model/query";
import type { Project, Task } from "../../core/model/types";
import { loadBacklog, type LoadedBacklog } from "../../core/store/load";
import { findGitRoots, findProjectForDir } from "../../core/store/resolve-project";
import { formatTaskRef } from "../format";
import { applyAll } from "../apply-all";
import { usageError, type CliCommand } from "../command";
import { EXIT, UsageError, parseCommandArgs, type CliIo } from "../io";
import { requireProject, requireTask } from "../lookups";
import { cliMessages } from "../messages";
import { taskWriter, type TaskWrite } from "../task-write";
import { taskJson } from "../describe";
import { printTask } from "./show";

export const takeCommand: CliCommand = {
  name: "take",
  usage: (language) => cliMessages(language).takeUsage(),
  run: runTake,
};

type Refusal = { code: number; lines: string[] };

type Selection = { ok: true; task: Task } | { ok: false; exitCode: number };

async function runTake(args: string[], io: CliIo): Promise<number> {
  const { values, positionals } = parseCommandArgs(io.language, args, {
      next: { type: "boolean", default: false },
      force: { type: "boolean", default: false },
      project: { type: "string" },
      path: { type: "string" },
      json: { type: "boolean", default: false },
    });
  const mode = takeMode(io, values, positionals);
  const inapplicable = mode.kind === "id" ? values.project !== undefined : values.force;
  if (inapplicable) throw usageError(takeCommand, io.language);
  const loaded = await loadBacklog(io.backlogRoot);
  if (mode.kind === "path") return takeByPath(loaded, io, mode.path, values.project, { json: values.json });
  const selected = mode.kind === "next" ? selectNext(loaded, io, values.project) : selectById(loaded, io, mode.id);
  if (!selected.ok) return selected.exitCode;

  const refusal = takeRefusal(io, selected.task, buildIndex(loaded.tasks), { ignoreBlockers: values.force });
  if (refusal) {
    for (const line of refusal.lines) io.warn(line);
    return refusal.code;
  }
  const { code, taken, tasks } = await takeAll(loaded.tasks, [selected.task], io);
  for (const task of taken) await printTask(io, task, tasks, { json: values.json });
  return code;
}

type TakeMode = { kind: "path"; path: string } | { kind: "next" } | { kind: "id"; id: string };

function takeMode(io: CliIo, values: { path?: string | undefined; next: boolean }, positionals: string[]): TakeMode {
  const chosen = [values.path !== undefined && "--path", values.next && "--next", positionals.length > 0 && "ID"].filter((name) => name !== false);
  if (chosen.length > 1) throw new UsageError(cliMessages(io.language).chooseOnlyOne(chosen.join(", ")));
  if (values.path !== undefined) return { kind: "path", path: values.path };
  if (values.next) return { kind: "next" };
  const [id] = positionals;
  if (id === undefined || positionals.length > 1) throw usageError(takeCommand, io.language);
  return { kind: "id", id };
}

async function takeByPath(loaded: LoadedBacklog, io: CliIo, path: string, projectId: string | undefined, { json }: { json: boolean }): Promise<number> {
  const project = requireProject(loaded, io, projectId);
  if (!project) return EXIT.notFound;
  const target = repoRelativePath(io, project, path);
  const index = buildIndex(loaded.tasks);
  const matching = loaded.tasks.filter((task) => task.projectId === project.id && isOpenTaskAt(task, target));
  const takeable = matching.filter((task) => {
    const refusal = takeRefusal(io, task, index, { ignoreBlockers: false });
    for (const line of refusal?.lines ?? []) io.warn(line);
    return refusal === null;
  });
  if (takeable.length === 0) {
    if (matching.length > 0) return EXIT.refused;
    io.warn(cliMessages(io.language).noOpenTasksAt(path));
    return EXIT.notFound;
  }
  const { code, taken, tasks } = await takeAll(loaded.tasks, takeable, io);
  if (json) io.print(JSON.stringify(taken.map((task) => taskJson(task, tasks)), null, 2));
  else {
    for (const [position, task] of taken.entries()) {
      if (position > 0) io.print("---");
      await printTask(io, task, tasks, { json: false });
    }
  }
  return code;
}

function isOpenTaskAt(task: Task, path: string): boolean {
  const workable = task.type === "task" && !isClosed(task.status) && task.status !== "blocked";
  return workable && task.source !== undefined && isInside(sourcePath(task.source), path);
}

function isInside(file: string, path: string): boolean {
  return path === "" || file === path || file.startsWith(`${path}/`);
}

function repoRelativePath(io: CliIo, project: Project, path: string): string {
  const roots = findGitRoots(io.cwd);
  if (roots === null || findProjectForDir([project], io.cwd, io.home) === undefined) return sourcePath(path);
  const fromRoot = relative(roots.worktree, resolve(realpathSync(io.cwd), sourcePath(path))).split(sep).join("/");
  const outsideRepo = fromRoot === ".." || fromRoot.startsWith("../");
  return outsideRepo ? sourcePath(path) : fromRoot;
}

type Taken = { code: number; taken: Task[]; tasks: readonly Task[] };

async function takeAll(loadedTasks: readonly Task[], chosen: readonly Task[], io: CliIo): Promise<Taken> {
  const write = taskWriter(io, loadedTasks);
  let tasks = loadedTasks;
  const taken: Task[] = [];
  const code = await applyAll(chosen, async (task) => {
    const written: TaskWrite = task.status === "in-progress" ? { ok: true, task } : await write(task, { status: "in-progress" });
    if (!written.ok) return written.exitCode;
    tasks = tasks.map((candidate) => (candidate.id === written.task.id ? written.task : candidate));
    taken.push(written.task);
    return EXIT.ok;
  });
  return { code, taken, tasks };
}

function selectById(loaded: LoadedBacklog, io: CliIo, id: string): Selection {
  const task = requireTask(loaded, io, id);
  return task ? { ok: true, task } : { ok: false, exitCode: EXIT.notFound };
}

function selectNext(loaded: LoadedBacklog, io: CliIo, projectId: string | undefined): Selection {
  const project = requireProject(loaded, io, projectId);
  if (!project) return { ok: false, exitCode: EXIT.notFound };
  const index = buildIndex(loaded.tasks);
  const task = pickNextTask(loaded.tasks, project.id, index);
  if (task) return { ok: true, task };
  io.warn(cliMessages(io.language).noTakeableInProject(project.id));
  const blocked = loaded.tasks.some((candidate) => candidate.projectId === project.id && isTakeable(candidate) && openBlockers(candidate, index).length > 0);
  return { ok: false, exitCode: blocked ? EXIT.refused : EXIT.notFound };
}

function isTakeable(task: Task): boolean {
  return task.type === "task" && !isClosed(task.status);
}

function takeRefusal(io: CliIo, task: Task, index: BacklogIndex, { ignoreBlockers }: { ignoreBlockers: boolean }): Refusal | null {
  const cli = cliMessages(io.language);
  if (task.type === "epic") {
    const openChildren = epicChildren(task, index).filter((child) => !isClosed(child.status));
    const childLines = openChildren.length === 0 ? [cli.noOpenChildren] : openChildren.map((child) => `  ${formatTaskRef(child)}`);
    return { code: EXIT.invalid, lines: [cli.epicTakeChildren(task.id), ...childLines] };
  }
  if (isClosed(task.status)) return { code: EXIT.refused, lines: [cli.alreadyInStatus(task.id, task.status)] };
  const blockers = openBlockers(task, index);
  if (blockers.length > 0 && !ignoreBlockers) {
    return {
      code: EXIT.refused,
      lines: [cli.blockedByOpenTasks(task.id), ...blockers.map((blocker) => `  ${formatTaskRef(blocker)}`)],
    };
  }
  return null;
}
