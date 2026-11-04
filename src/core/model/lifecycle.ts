import type { StoreMessages } from "../messages/store-messages";
import { DAY_MS, formatLocalIso } from "./dates";
import { buildIndex, epicChildren, isClosed, type BacklogIndex, type ClosedStatus } from "./graph";
import type { Problem } from "./problems";
import type { ParseError, Resolution, Task, TaskStatus } from "./types";

export const RETENTION_DAYS = 7;

export const RESOLUTION_STATUS: Record<Resolution, ClosedStatus> = {
  fixed: "done",
  obsolete: "cancelled",
  duplicate: "cancelled",
  "epic-done": "done",
};

export type Closure = { resolution: Resolution; reason: string };

export function normalizeClosingReason(reason: string): string {
  return reason
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .join(" ");
}

export type EpicWithChildren = { epic: Task; childIds: string[] };

export type EpicClosingPlan = { close: EpicWithChildren[]; waiting: EpicWithChildren[] };

export function changeStatus(task: Task, status: TaskStatus, now: Date, closure?: Closure): Task {
  if (status === task.status) return closure === undefined ? task : { ...task, ...closure };
  return { ...task, status, closed: closedAt(task, status, now), resolution: closure?.resolution, reason: closure?.reason };
}

export function settleLifecycle(task: Task, now: Date): Task {
  if (!isClosed(task.status)) return { ...task, closed: undefined, resolution: undefined, reason: undefined };
  return task.closed === undefined ? { ...task, closed: formatLocalIso(now) } : task;
}

export type ScheduledDeletion = { at: Date } | { afterEpic: string };

export function scheduledDeletion(task: Task, index: BacklogIndex): ScheduledDeletion | undefined {
  if (!isClosed(task.status) || task.closed === undefined) return undefined;
  const keeper = keepingEpic(task, index);
  return keeper === undefined ? { at: new Date(Date.parse(task.closed) + RETENTION_DAYS * DAY_MS) } : { afterEpic: keeper.id };
}

export function isExpired(task: Task, now: Date, index: BacklogIndex): boolean {
  const deletion = scheduledDeletion(task, index);
  return deletion !== undefined && "at" in deletion && deletion.at.getTime() <= now.getTime();
}

function keepingEpic(task: Task, index: BacklogIndex): Task | undefined {
  const epic = task.epic === undefined ? undefined : index.byId.get(task.epic);
  if (epic?.type !== "epic") return undefined;
  const reopensWithOpenTasks = isAutoClosedEpic(epic) && openChildIds(epic, index).length > 0;
  return !isClosed(epic.status) || reopensWithOpenTasks ? epic : undefined;
}

export function planEpicClosing(tasks: readonly Task[], parseErrors: readonly ParseError[]): EpicClosingPlan {
  const unreadableProjects = new Set(parseErrors.map((error) => error.projectId));
  const completed = completedEpics(tasks);
  return {
    close: completed.filter(({ epic }) => !unreadableProjects.has(epic.projectId)),
    waiting: completed.filter(({ epic }) => unreadableProjects.has(epic.projectId)),
  };
}

function completedEpics(tasks: readonly Task[]): EpicWithChildren[] {
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

export function isAutoClosedEpic(task: Task): boolean {
  return task.type === "epic" && isClosed(task.status) && task.resolution === "epic-done";
}

function openChildIds(epic: Task, index: BacklogIndex): string[] {
  return epicChildren(epic, index).flatMap((child) => (isClosed(child.status) ? [] : [child.id]));
}

export function planEpicReopening(tasks: readonly Task[]): EpicWithChildren[] {
  const index = buildIndex(tasks);
  return tasks.flatMap((epic) => {
    if (!isAutoClosedEpic(epic)) return [];
    const childIds = openChildIds(epic, index);
    return childIds.length === 0 ? [] : [{ epic, childIds }];
  });
}

export function epicClosingProblems(before: Task, after: Task, index: BacklogIndex): Problem[] {
  if (after.type !== "epic" || !isClosed(after.status) || isClosed(before.status)) return [];
  const childIds = openChildIds(after, index);
  return childIds.length === 0 ? [] : [{ code: "epic-closed-with-open-tasks", children: childIds }];
}

export function epicDoneClosure(childIds: readonly string[], messages: Pick<StoreMessages, "epicDoneReason">): Closure {
  return { resolution: "epic-done", reason: messages.epicDoneReason(childIds) };
}

function closedAt(task: Task, status: TaskStatus, now: Date): string | undefined {
  if (!isClosed(status)) return undefined;
  return isClosed(task.status) ? task.closed : formatLocalIso(now);
}
