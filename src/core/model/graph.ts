import { checklistItems } from "./checklist";
import type { Task, TaskStatus } from "./types";

export type BacklogIndex = {
  byId: ReadonlyMap<string, Task>;
  dependentsOf: ReadonlyMap<string, readonly Task[]>;
  relatedFrom: ReadonlyMap<string, readonly Task[]>;
  childrenOf: ReadonlyMap<string, readonly Task[]>;
};

const CLOSED_STATUSES: ReadonlySet<TaskStatus> = new Set(["done", "cancelled"]);

export function isClosed(status: TaskStatus): boolean {
  return CLOSED_STATUSES.has(status);
}

export function buildIndex(tasks: readonly Task[]): BacklogIndex {
  const byId = new Map<string, Task>();
  const dependentsOf = new Map<string, Task[]>();
  const relatedFrom = new Map<string, Task[]>();
  const childrenOf = new Map<string, Task[]>();
  for (const task of tasks) {
    byId.set(task.id, task);
    for (const blockerId of task.blockedBy) appendTo(dependentsOf, blockerId, task);
    for (const relatedId of task.related) appendTo(relatedFrom, relatedId, task);
    if (task.epic !== undefined) appendTo(childrenOf, task.epic, task);
  }
  return { byId, dependentsOf, relatedFrom, childrenOf };
}

export function openBlockers(task: Task, index: BacklogIndex): Task[] {
  return existingTasks(task.blockedBy, index).filter((blocker) => !isClosed(blocker.status));
}

export function isBlocked(task: Task, index: BacklogIndex): boolean {
  return openBlockers(task, index).length > 0;
}

export function missingReferences(task: Task, index: BacklogIndex): string[] {
  return [...new Set([...task.blockedBy, ...task.related])].filter((id) => !index.byId.has(id));
}

export function dependentTasks(task: Task, index: BacklogIndex): readonly Task[] {
  return index.dependentsOf.get(task.id) ?? [];
}

export function relatedTasks(task: Task, index: BacklogIndex): Task[] {
  const both = [...existingTasks(task.related, index), ...(index.relatedFrom.get(task.id) ?? [])];
  return [...new Map(both.filter((other) => other.id !== task.id).map((other) => [other.id, other])).values()];
}

export function epicChildren(epic: Task, index: BacklogIndex): readonly Task[] {
  return index.childrenOf.get(epic.id) ?? [];
}

export function taskProgress(task: Task, index: BacklogIndex): number | null {
  if (task.status === "done") return 100;
  if (task.type === "epic") {
    const active = epicChildren(task, index).filter((child) => child.status !== "cancelled");
    return active.length === 0 ? null : percent(active.filter((child) => child.status === "done").length, active.length);
  }
  const items = checklistItems(task.body);
  return items.length === 0 ? null : percent(items.filter((item) => item.checked).length, items.length);
}

function existingTasks(ids: readonly string[], index: BacklogIndex): Task[] {
  return ids.flatMap((id) => index.byId.get(id) ?? []);
}

function appendTo(map: Map<string, Task[]>, key: string, task: Task): void {
  const list = map.get(key);
  if (list) list.push(task);
  else map.set(key, [task]);
}

function percent(part: number, total: number): number {
  return Math.round((part / total) * 100);
}
