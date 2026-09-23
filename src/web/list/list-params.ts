import { isClosed } from "../../core/model/graph";
import { OPEN_STATUSES, SORT_KEYS, type SortDirection, type SortKey, type TaskFilter, type TaskSort } from "../../core/model/query";
import { PRIORITIES, TASK_STATUSES, TASK_TYPES, type TaskStatus } from "../../core/model/types";

export type ListParams = { filter: Omit<TaskFilter, "projectId">; sort: TaskSort };

export const DEFAULT_SORT: TaskSort = { key: "created", direction: "desc" };
export const DEFAULT_FILTER: ListParams["filter"] = { statuses: OPEN_STATUSES };
const NO_EPIC = "none";
const ANY_STATUS = "all";

export const AUTO_CLOSED_VIEW: ListParams = {
  filter: { statuses: ["done", "cancelled"], onlyAutoClosed: true },
  sort: { key: "closed", direction: "desc" },
};

const DIRECTIONS: readonly SortDirection[] = ["asc", "desc"];

const NATURAL_DIRECTION: Record<SortKey, SortDirection> = {
  created: "desc",
  closed: "desc",
  priority: "desc",
  progress: "desc",
  title: "asc",
  status: "asc",
  id: "asc",
};

export function pickSortKey(sort: TaskSort, key: SortKey): TaskSort {
  return sort.key === key ? reverseSort(sort) : { key, direction: NATURAL_DIRECTION[key] };
}

function reverseSort(sort: TaskSort): TaskSort {
  return { ...sort, direction: sort.direction === "asc" ? "desc" : "asc" };
}

export type DateColumn = Extract<SortKey, "created" | "closed">;

export function dateColumnFor(filter: ListParams["filter"]): DateColumn {
  const statuses = filter.statuses ?? [];
  return statuses.length > 0 && statuses.every(isClosed) ? "closed" : "created";
}

export function followDateColumn(sort: TaskSort, column: DateColumn): TaskSort {
  const sortsByDate = sort.key === "created" || sort.key === "closed";
  return sortsByDate && sort.key !== column ? { ...sort, key: column } : sort;
}

export function readListParams(search: URLSearchParams): ListParams {
  return {
    filter: {
      query: search.get("q") ?? undefined,
      statuses: readStatuses(search.get("status")),
      priorities: readList(search.get("priority"), PRIORITIES),
      tags: readTags(search.get("tag")),
      epic: readEpic(search.get("epic")),
      type: readOne(search.get("type"), TASK_TYPES),
      onlyUnblocked: search.get("unblocked") === "1" ? true : undefined,
      onlyAutoClosed: search.get("auto") === "1" ? true : undefined,
    },
    sort: {
      key: readOne(search.get("sort"), SORT_KEYS) ?? DEFAULT_SORT.key,
      direction: readOne(search.get("dir"), DIRECTIONS) ?? DEFAULT_SORT.direction,
    },
  };
}

export function isDefaultFilter(filter: ListParams["filter"]): boolean {
  return writeListParams({ filter, sort: DEFAULT_SORT }).toString() === "";
}

export function writeListParams({ filter, sort }: ListParams): URLSearchParams {
  const search = new URLSearchParams();
  if (filter.query) search.set("q", filter.query);
  if (filter.statuses === undefined) search.set("status", ANY_STATUS);
  else if (filter.statuses.length === 0) search.set("status", "");
  else if (!sameValues(filter.statuses, OPEN_STATUSES)) search.set("status", filter.statuses.join(","));
  if (filter.priorities?.length) search.set("priority", filter.priorities.join(","));
  if (filter.tags?.length) search.set("tag", filter.tags.join(","));
  if (filter.epic !== undefined) search.set("epic", filter.epic ?? NO_EPIC);
  if (filter.type) search.set("type", filter.type);
  if (filter.onlyUnblocked) search.set("unblocked", "1");
  if (filter.onlyAutoClosed) search.set("auto", "1");
  if (sort.key !== DEFAULT_SORT.key) search.set("sort", sort.key);
  if (sort.direction !== DEFAULT_SORT.direction) search.set("dir", sort.direction);
  return search;
}

function readStatuses(value: string | null): readonly TaskStatus[] | undefined {
  if (value === null) return OPEN_STATUSES;
  if (value === ANY_STATUS) return undefined;
  if (value === "") return [];
  return readList(value, TASK_STATUSES) ?? OPEN_STATUSES;
}

function readTags(value: string | null): string[] | undefined {
  const tags = splitValues(value);
  return tags.length > 0 ? tags : undefined;
}

function readEpic(value: string | null): string | null | undefined {
  if (value === null) return undefined;
  return value === NO_EPIC ? null : value;
}

function readList<T extends string>(value: string | null, allowed: readonly T[]): T[] | undefined {
  const known = splitValues(value).filter((item): item is T => (allowed as readonly string[]).includes(item));
  return known.length > 0 ? known : undefined;
}

function readOne<T extends string>(value: string | null, allowed: readonly T[]): T | undefined {
  return allowed.find((candidate) => candidate === value);
}

function splitValues(value: string | null): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function sameValues(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value) => b.includes(value));
}
