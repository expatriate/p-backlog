import { realpathSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { sourcePath } from "../../core/check/candidates";
import { buildIndex, epicChildren, isClosed, openBlockers, type BacklogIndex } from "../../core/model/graph";
import { pickNextTask } from "../../core/model/query";
import type { Project, Task } from "../../core/model/types";
import { loadBacklog, type LoadedBacklog } from "../../core/store/load";
import { findGitRoot, findProjectForRepoRoot } from "../../core/store/resolve-project";
import { formatTaskRef } from "../format";
import { applyAll } from "../apply-all";
import { usageError, type CliCommand } from "../command";
import { EXIT, UsageError, withUsageErrors, type CliIo } from "../io";
import { requireProject, requireTask } from "../lookups";
import { taskWriter, type TaskWrite } from "../task-write";
import { printTask } from "./show";

export const takeCommand: CliCommand = {
  name: "take",
  usage: [
    "<ID> [--force] [--json]",
    "--next [--project id] [--json]",
    "--path <файл|каталог> [--project id] [--json]   (все открытые задачи внутри пути)",
  ],
  run: runTake,
};

type Refusal = { code: number; lines: string[] };

type Selection = { ok: true; task: Task } | { ok: false; exitCode: number };

async function runTake(args: string[], io: CliIo): Promise<number> {
  const { values, positionals } = withUsageErrors(() =>
    parseArgs({
      args,
      allowPositionals: true,
      options: {
        next: { type: "boolean", default: false },
        force: { type: "boolean", default: false },
        project: { type: "string" },
        path: { type: "string" },
        json: { type: "boolean", default: false },
      },
    }),
  );
  const mode = takeMode(values, positionals);
  const loaded = await loadBacklog(io.backlogRoot);
  if (mode.kind === "path") return takeByPath(loaded, io, mode.path, values.project, { json: values.json });
  const selected = mode.kind === "next" ? selectNext(loaded, io, values.project) : selectById(loaded, io, mode.id);
  if (!selected.ok) return selected.exitCode;

  const refusal = takeRefusal(selected.task, buildIndex(loaded.tasks), { ignoreBlockers: values.force });
  if (refusal) {
    for (const line of refusal.lines) io.warn(line);
    return refusal.code;
  }
  return takeAll(loaded.tasks, [selected.task], io, { json: values.json });
}

type TakeMode = { kind: "path"; path: string } | { kind: "next" } | { kind: "id"; id: string };

function takeMode(values: { path?: string | undefined; next: boolean }, positionals: string[]): TakeMode {
  const chosen = [values.path !== undefined && "--path", values.next && "--next", positionals.length > 0 && "ID"].filter((name) => name !== false);
  if (chosen.length > 1) throw new UsageError(`Укажите что-то одно: ${chosen.join(", ")}`);
  if (values.path !== undefined) return { kind: "path", path: values.path };
  if (values.next) return { kind: "next" };
  const [id] = positionals;
  if (id === undefined || positionals.length > 1) throw usageError(takeCommand);
  return { kind: "id", id };
}

async function takeByPath(loaded: LoadedBacklog, io: CliIo, path: string, projectId: string | undefined, { json }: { json: boolean }): Promise<number> {
  const project = requireProject(loaded, io, projectId);
  if (!project) return EXIT.notFound;
  const target = repoRelativePath(io, project, path);
  const index = buildIndex(loaded.tasks);
  const matching = loaded.tasks.filter((task) => task.projectId === project.id && isOpenTaskAt(task, target));
  const takeable = matching.filter((task) => {
    const refusal = takeRefusal(task, index, { ignoreBlockers: false });
    for (const line of refusal?.lines ?? []) io.warn(line);
    return refusal === null;
  });
  if (takeable.length === 0) {
    if (matching.length > 0) return EXIT.refused;
    io.warn(`Открытых задач по ${path} нет`);
    return EXIT.notFound;
  }
  return takeAll(loaded.tasks, takeable, io, { json });
}

function isOpenTaskAt(task: Task, path: string): boolean {
  const workable = task.type === "task" && !isClosed(task.status) && task.status !== "blocked";
  return workable && task.source !== undefined && isInside(sourcePath(task.source), path);
}

function isInside(file: string, path: string): boolean {
  return path === "" || file === path || file.startsWith(`${path}/`);
}

function repoRelativePath(io: CliIo, project: Project, path: string): string {
  const gitRoot = findGitRoot(io.cwd);
  if (gitRoot === null || findProjectForRepoRoot([project], gitRoot, io.home) === undefined) return sourcePath(path);
  const fromRoot = relative(gitRoot, resolve(realpathSync(io.cwd), sourcePath(path))).split(sep).join("/");
  const outsideRepo = fromRoot === ".." || fromRoot.startsWith("../");
  return outsideRepo ? sourcePath(path) : fromRoot;
}

async function takeAll(loadedTasks: readonly Task[], chosen: readonly Task[], io: CliIo, { json }: { json: boolean }): Promise<number> {
  const write = taskWriter(io, loadedTasks);
  let current = loadedTasks;
  let printed = 0;
  return applyAll(chosen, async (task) => {
    const taken: TaskWrite = task.status === "in-progress" ? { ok: true, task } : await write(task, { status: "in-progress" });
    if (!taken.ok) return taken.exitCode;
    current = current.map((candidate) => (candidate.id === taken.task.id ? taken.task : candidate));
    if (printed > 0) io.print("---");
    printed++;
    await printTask(io, taken.task, current, { json });
    return EXIT.ok;
  });
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
  io.warn(`В проекте ${project.id} нет задач, которые можно взять в работу`);
  const blocked = loaded.tasks.some((candidate) => candidate.projectId === project.id && isTakeable(candidate) && openBlockers(candidate, index).length > 0);
  return { ok: false, exitCode: blocked ? EXIT.refused : EXIT.notFound };
}

function isTakeable(task: Task): boolean {
  return task.type === "task" && !isClosed(task.status);
}

function takeRefusal(task: Task, index: BacklogIndex, { ignoreBlockers }: { ignoreBlockers: boolean }): Refusal | null {
  if (task.type === "epic") {
    const openChildren = epicChildren(task, index).filter((child) => !isClosed(child.status));
    const childLines = openChildren.length === 0 ? ["  открытых задач нет"] : openChildren.map((child) => `  ${formatTaskRef(child)}`);
    return { code: EXIT.invalid, lines: [`${task.id} — эпик. Возьмите в работу одну из его задач:`, ...childLines] };
  }
  if (isClosed(task.status)) return { code: EXIT.refused, lines: [`${task.id} уже в статусе ${task.status}`] };
  const blockers = openBlockers(task, index);
  if (blockers.length > 0 && !ignoreBlockers) {
    return {
      code: EXIT.refused,
      lines: [`${task.id} заблокирована открытыми задачами:`, ...blockers.map((blocker) => `  ${formatTaskRef(blocker)}`)],
    };
  }
  return null;
}
