import { parseArgs } from "node:util";
import { sourcePath } from "../../core/check/candidates";
import { buildIndex, epicChildren, isClosed, openBlockers, type BacklogIndex } from "../../core/model/graph";
import { pickNextTask } from "../../core/model/query";
import type { Task } from "../../core/model/types";
import { loadBacklog, type LoadedBacklog } from "../../core/store/load";
import { updateTask } from "../../core/store/update";
import { formatTaskRef } from "../format";
import { EXIT, UsageError, withUsageErrors, type CliIo } from "../io";
import { requireProject, requireTask } from "../lookups";
import { reportUpdateFailure } from "../update-failure";
import { printTask } from "./show";

type Refusal = { code: number; lines: string[] };

export async function runTake(args: string[], io: CliIo): Promise<number> {
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
  const loaded = await loadBacklog(io.backlogRoot);
  if (values.path !== undefined) return takeByPath(loaded, io, positionals, values.path, values.project);
  const task = values.next ? selectNext(loaded, io, positionals, values.project) : selectById(loaded, io, positionals);
  if (!task) return EXIT.notFound;

  const refusal = takeRefusal(task, buildIndex(loaded.tasks), { ignoreBlockers: values.force });
  if (refusal) {
    for (const line of refusal.lines) io.warn(line);
    return refusal.code;
  }
  return takeOne(task, io, values.json);
}

async function takeByPath(loaded: LoadedBacklog, io: CliIo, positionals: string[], path: string, projectId: string | undefined): Promise<number> {
  if (positionals.length > 0) throw new UsageError("Укажите либо ID, либо --path");
  const project = requireProject(loaded, io, projectId);
  if (!project) return EXIT.notFound;
  const target = sourcePath(path);
  const index = buildIndex(loaded.tasks);
  const matching = loaded.tasks.filter((task) => task.projectId === project.id && isOpenTaskAt(task, target));
  const takeable = matching.filter((task) => {
    const refusal = takeRefusal(task, index, { ignoreBlockers: false });
    for (const line of refusal?.lines ?? []) io.warn(line);
    return refusal === null;
  });
  if (takeable.length === 0) {
    if (matching.length === 0) io.warn(`Открытых задач по ${target} нет`);
    return EXIT.notFound;
  }
  for (const [position, task] of takeable.entries()) {
    if (position > 0) io.print("---");
    const code = await takeOne(task, io, false);
    if (code !== EXIT.ok) return code;
  }
  return EXIT.ok;
}

function isOpenTaskAt(task: Task, path: string): boolean {
  const workable = task.type === "task" && !isClosed(task.status) && task.status !== "blocked";
  return workable && task.source !== undefined && isInside(sourcePath(task.source), path);
}

function isInside(file: string, path: string): boolean {
  return file === path || file.startsWith(`${path}/`);
}

async function takeOne(task: Task, io: CliIo, json: boolean): Promise<number> {
  if (task.status !== "in-progress") {
    const result = await updateTask(io.backlogRoot, {
      id: task.id,
      changes: { status: "in-progress" },
      expectedVersion: task.version,
      now: io.now(),
      via: "cli",
    });
    if (!result.ok) return reportUpdateFailure(io, task.id, result);
  }
  const refreshed = await loadBacklog(io.backlogRoot);
  const taken = refreshed.tasks.find((candidate) => candidate.id === task.id) ?? task;
  await printTask(io, taken, refreshed.tasks, { json });
  return EXIT.ok;
}

function selectById(loaded: LoadedBacklog, io: CliIo, positionals: string[]): Task | undefined {
  const [id, ...rest] = positionals;
  if (id === undefined || rest.length > 0) throw new UsageError("Использование: backlog take <ID> | backlog take --next");
  return requireTask(loaded, io, id);
}

function selectNext(loaded: LoadedBacklog, io: CliIo, positionals: string[], projectId: string | undefined): Task | undefined {
  if (positionals.length > 0) throw new UsageError("Укажите либо ID, либо --next");
  const project = requireProject(loaded, io, projectId);
  if (!project) return undefined;
  const task = pickNextTask(loaded.tasks, project.id, buildIndex(loaded.tasks));
  if (!task) io.warn(`В проекте ${project.id} нет задач, которые можно взять в работу`);
  return task;
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
