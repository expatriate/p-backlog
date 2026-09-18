import { formatLocalIso } from "./dates";
import { epicChildren, isClosed, type BacklogIndex } from "./graph";
import type { Resolution, Task, TaskStatus } from "./types";

export const RETENTION_DAYS = 7;

export const DAY_MS = 24 * 60 * 60 * 1000;

export const RESOLUTION_STATUS: Record<Resolution, "done" | "cancelled"> = {
  fixed: "done",
  obsolete: "cancelled",
  duplicate: "cancelled",
  "epic-done": "done",
};

export type Closure = { resolution: Resolution; reason: string };

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

export function completedEpicChildren(task: Task, index: BacklogIndex): string[] | null {
  if (task.type !== "epic" || isClosed(task.status)) return null;
  const children = epicChildren(task, index);
  const complete = children.length > 0 && children.every((child) => isClosed(child.status));
  return complete ? children.map((child) => child.id) : null;
}

export function epicDoneClosure(childIds: readonly string[]): Closure {
  return { resolution: "epic-done", reason: `все задачи эпика закрыты: ${childIds.join(", ")}` };
}

function closedAt(task: Task, status: TaskStatus, now: Date): string | undefined {
  if (!isClosed(status)) return undefined;
  return isClosed(task.status) ? task.closed : formatLocalIso(now);
}
