import { isBlocked, taskProgress, type BacklogIndex } from "./graph";
import { compareIds } from "./ids";
import { normalizeTag, PRIORITIES, type Priority, type Task, type TaskStatus, type TaskType } from "./types";

export const OPEN_STATUSES: readonly TaskStatus[] = ["backlog", "in-progress", "blocked"];
const STATUS_SORT_ORDER: readonly TaskStatus[] = ["in-progress", "blocked", "backlog", "done", "cancelled"];

export type TaskFilter = {
  projectId?: string;
  query?: string;
  statuses?: readonly TaskStatus[];
  priorities?: readonly Priority[];
  tags?: readonly string[];
  epic?: string | null;
  type?: TaskType;
  onlyUnblocked?: boolean;
};

export const SORT_KEYS = ["created", "priority", "progress", "title", "status", "id"] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type SortDirection = "asc" | "desc";
export type TaskSort = { key: SortKey; direction: SortDirection };

export function normalizeText(text: string): string {
  return text.toLowerCase().replaceAll("ё", "е");
}

export function matchesQuery(task: Task, query: string): boolean {
  const haystack = normalizeText(`${task.id}\n${task.title}\n${task.body}`);
  return normalizeText(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

export function filterTasks(tasks: readonly Task[], filter: TaskFilter, index: BacklogIndex): Task[] {
  const tags = (filter.tags ?? []).map(normalizeTag);
  return tasks.filter(
    (task) =>
      (filter.projectId === undefined || task.projectId === filter.projectId) &&
      (filter.query === undefined || matchesQuery(task, filter.query)) &&
      anyOrIncludes(filter.statuses, task.status) &&
      anyOrIncludes(filter.priorities, task.priority) &&
      tags.every((tag) => task.tags.includes(tag)) &&
      matchesEpic(task, filter.epic) &&
      (filter.type === undefined || task.type === filter.type) &&
      (!filter.onlyUnblocked || !isBlocked(task, index)),
  );
}

export function sortTasks(tasks: readonly Task[], sort: TaskSort, index: BacklogIndex): Task[] {
  const sign = sort.direction === "asc" ? 1 : -1;
  const progress = new Map(tasks.map((task) => [task.id, taskProgress(task, index)]));
  const compare = (a: Task, b: Task): number => {
    switch (sort.key) {
      case "created":
        return sign * (Date.parse(a.created) - Date.parse(b.created));
      case "priority":
        return sign * (priorityRank(a.priority) - priorityRank(b.priority));
      case "status":
        return sign * (STATUS_SORT_ORDER.indexOf(a.status) - STATUS_SORT_ORDER.indexOf(b.status));
      case "title":
        return sign * a.title.localeCompare(b.title, "ru");
      case "progress":
        return compareNullsLast(progress.get(a.id) ?? null, progress.get(b.id) ?? null, sign);
      case "id":
        return sign * compareIds(a.id, b.id);
    }
  };
  return [...tasks].sort((a, b) => compare(a, b) || compareIds(a.id, b.id));
}

export function pickNextTask(tasks: readonly Task[], projectId: string, index: BacklogIndex): Task | undefined {
  const candidates = tasks.filter(
    (task) => task.projectId === projectId && task.type === "task" && task.status === "backlog" && !isBlocked(task, index),
  );
  return candidates.sort(
    (a, b) =>
      priorityRank(b.priority) - priorityRank(a.priority) ||
      Date.parse(a.created) - Date.parse(b.created) ||
      compareIds(a.id, b.id),
  )[0];
}

function priorityRank(priority: Priority): number {
  return PRIORITIES.indexOf(priority);
}

function matchesEpic(task: Task, epic: string | null | undefined): boolean {
  if (epic === undefined) return true;
  if (epic === null) return task.epic === undefined;
  return task.epic === epic;
}

function anyOrIncludes<T>(allowed: readonly T[] | undefined, value: T): boolean {
  return allowed === undefined || allowed.includes(value);
}

function compareNullsLast(a: number | null, b: number | null, sign: number): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return sign * (a - b);
}
