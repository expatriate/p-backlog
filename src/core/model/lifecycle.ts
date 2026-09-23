import type { CoreMessages } from "../messages";
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

type CompletedEpic = { epic: Task; childIds: string[] };

export type EpicClosingPlan = { close: CompletedEpic[]; waiting: CompletedEpic[] };

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
  const unreadableProjects = new Set(parseErrors.map((error) => error.projectId));
  const completed = completedEpics(tasks);
  return {
    close: completed.filter(({ epic }) => !unreadableProjects.has(epic.projectId)),
    waiting: completed.filter(({ epic }) => unreadableProjects.has(epic.projectId)),
  };
}

function completedEpics(tasks: readonly Task[]): CompletedEpic[] {
  const index = buildIndex(tasks);
  return tasks.flatMap((epic) => {
    const childIds = completedEpicChildren(epic, index);
    return childIds === null ? [] : [{ epic, childIds }];
  });
}

function completedEpicChildren(task: Task, index: BacklogIndex): string[] | null {
  if (task.type !== "epic" || isClosed(task.status)) return null;
  const children = epicChildren(task, index);
  const complete = children.length > 0 && children.every((child) => isClosed(child.status));
  return complete ? children.map((child) => child.id) : null;
}

export function epicDoneClosure(childIds: readonly string[], messages: Pick<CoreMessages, "epicDoneReason">): Closure {
  return { resolution: "epic-done", reason: messages.epicDoneReason(childIds) };
}

function closedAt(task: Task, status: TaskStatus, now: Date): string | undefined {
  if (!isClosed(status)) return undefined;
  return isClosed(task.status) ? task.closed : formatLocalIso(now);
}
