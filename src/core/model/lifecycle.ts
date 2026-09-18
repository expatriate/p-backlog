import { formatLocalIso } from "./dates";
import { buildIndex, epicChildren, isClosed, type BacklogIndex } from "./graph";
import type { ParseError, Resolution, Task, TaskStatus } from "./types";

export const RETENTION_DAYS = 7;

export const DAY_MS = 24 * 60 * 60 * 1000;

export const RESOLUTION_STATUS: Record<Resolution, "done" | "cancelled"> = {
  fixed: "done",
  obsolete: "cancelled",
  duplicate: "cancelled",
  "epic-done": "done",
};

export type Closure = { resolution: Resolution; reason: string };

export type EpicClosure = { epic: Task; closure: Closure };

export type EpicClosingPlan = { close: EpicClosure[]; waiting: EpicClosure[] };

export function changeStatus(task: Task, status: TaskStatus, now: Date, closure?: Closure): Task {
  if (status === task.status) return task;
  return { ...task, status, closed: closedAt(task, status, now), resolution: closure?.resolution, reason: closure?.reason };
}

export function settleLifecycle(task: Task, now: Date): Task {
  if (!isClosed(task.status)) return { ...task, closed: undefined, resolution: undefined, reason: undefined };
  return task.closed === undefined ? { ...task, closed: formatLocalIso(now) } : task;
}

export function deletionDate(task: Task): Date | undefined {
  if (!isClosed(task.status) || task.closed === undefined) return undefined;
  return new Date(Date.parse(task.closed) + RETENTION_DAYS * DAY_MS);
}

export function isExpired(task: Task, now: Date): boolean {
  const deletesAt = deletionDate(task);
  return deletesAt !== undefined && deletesAt.getTime() <= now.getTime();
}

export function planEpicClosing(tasks: readonly Task[], parseErrors: readonly ParseError[]): EpicClosingPlan {
  const completed = completedEpics(tasks);
  return parseErrors.length > 0 ? { close: [], waiting: completed } : { close: completed, waiting: [] };
}

export function completedEpics(tasks: readonly Task[]): EpicClosure[] {
  const index = buildIndex(tasks);
  return tasks.flatMap((epic) => {
    const children = completedEpicChildren(epic, index);
    return children === null ? [] : [{ epic, closure: epicDoneClosure(children) }];
  });
}

function completedEpicChildren(task: Task, index: BacklogIndex): string[] | null {
  if (task.type !== "epic" || isClosed(task.status)) return null;
  const children = epicChildren(task, index);
  const complete = children.length > 0 && children.every((child) => isClosed(child.status));
  return complete ? children.map((child) => child.id) : null;
}

function epicDoneClosure(childIds: readonly string[]): Closure {
  return { resolution: "epic-done", reason: `все задачи эпика закрыты: ${childIds.join(", ")}` };
}

function closedAt(task: Task, status: TaskStatus, now: Date): string | undefined {
  if (!isClosed(status)) return undefined;
  return isClosed(task.status) ? task.closed : formatLocalIso(now);
}
