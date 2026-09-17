import { OPEN_STATUSES, type SortDirection, type SortKey, type TaskFilter, type TaskSort } from "../../core/model/query";
import { PRIORITIES, TASK_STATUSES, TASK_TYPES, type TaskStatus } from "../../core/model/types";

export type ListParams = { filter: Omit<TaskFilter, "projectId">; sort: TaskSort };

export const DEFAULT_SORT: TaskSort = { key: "created", direction: "desc" };
export const NO_EPIC = "none";
export const ANY_STATUS = "all";

const SORT_KEYS: readonly SortKey[] = ["created", "priority", "progress", "title", "status"];
const DIRECTIONS: readonly SortDirection[] = ["asc", "desc"];

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
    },
    sort: {
      key: readOne(search.get("sort"), SORT_KEYS) ?? DEFAULT_SORT.key,
      direction: readOne(search.get("dir"), DIRECTIONS) ?? DEFAULT_SORT.direction,
    },
  };
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
