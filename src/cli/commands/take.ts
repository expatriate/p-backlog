import { parseArgs } from "node:util";
import { sourcePath } from "../../core/check/candidates";
import { buildIndex, epicChildren, isClosed, openBlockers, type BacklogIndex } from "../../core/model/graph";
import { pickNextTask } from "../../core/model/query";
import type { Task } from "../../core/model/types";
import { loadBacklog, type LoadedBacklog } from "../../core/store/load";
import { formatTaskRef } from "../format";
import { EXIT, UsageError, withUsageErrors, type CliIo } from "../io";

const USAGE = "Использование: backlog take <ID> | backlog take --next | backlog take --path <путь>";
import { requireProject, requireTask } from "../lookups";
import { writeTask } from "../task-write";
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
  const mode = takeMode(values, positionals);
  const loaded = await loadBacklog(io.backlogRoot);
  if (mode.kind === "path") return takeByPath(loaded, io, mode.path, values.project, { json: values.json });
  const selected = mode.kind === "next" ? selectNext(loaded, io, values.project) : (requireTask(loaded, io, mode.id) ?? EXIT.notFound);
  if (typeof selected === "number") return selected;

  const refusal = takeRefusal(selected, buildIndex(loaded.tasks), { ignoreBlockers: values.force });
  if (refusal) {
    for (const line of refusal.lines) io.warn(line);
    return refusal.code;
  }
  return takeOne(selected, io, { json: values.json });
}

type TakeMode = { kind: "path"; path: string } | { kind: "next" } | { kind: "id"; id: string };

function takeMode(values: { path?: string | undefined; next: boolean }, positionals: string[]): TakeMode {
  const chosen = [values.path !== undefined && "--path", values.next && "--next", positionals.length > 0 && "ID"].filter((name) => name !== false);
  if (chosen.length > 1) throw new UsageError(`Укажите что-то одно: ${chosen.join(", ")}`);
  if (values.path !== undefined) return { kind: "path", path: values.path };
  if (values.next) return { kind: "next" };
  const [id] = positionals;
  if (id === undefined || positionals.length > 1) throw new UsageError(USAGE);
  return { kind: "id", id };
}

async function takeByPath(loaded: LoadedBacklog, io: CliIo, path: string, projectId: string | undefined, { json }: { json: boolean }): Promise<number> {
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
    if (matching.length > 0) return EXIT.refused;
    io.warn(`Открытых задач по ${target} нет`);
    return EXIT.notFound;
  }
  for (const [position, task] of takeable.entries()) {
    if (position > 0) io.print("---");
    const code = await takeOne(task, io, { json });
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

async function takeOne(task: Task, io: CliIo, { json }: { json: boolean }): Promise<number> {
  if (task.status !== "in-progress") {
    const written = await writeTask(io, task, { status: "in-progress" });
    if (!written.ok) return written.exitCode;
  }
  const refreshed = await loadBacklog(io.backlogRoot);
  const taken = refreshed.tasks.find((candidate) => candidate.id === task.id) ?? task;
  await printTask(io, taken, refreshed.tasks, { json });
  return EXIT.ok;
}

function selectNext(loaded: LoadedBacklog, io: CliIo, projectId: string | undefined): Task | number {
  const project = requireProject(loaded, io, projectId);
  if (!project) return EXIT.notFound;
  const index = buildIndex(loaded.tasks);
  const task = pickNextTask(loaded.tasks, project.id, index);
  if (task) return task;
  io.warn(`В проекте ${project.id} нет задач, которые можно взять в работу`);
  const blocked = loaded.tasks.some((candidate) => candidate.projectId === project.id && isTakeable(candidate) && openBlockers(candidate, index).length > 0);
  return blocked ? EXIT.refused : EXIT.notFound;
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
