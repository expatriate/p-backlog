import type { ListParams } from "./list-params";

export function toggled<T>(values: readonly T[], value: T): T[] {
  return values.includes(value) ? values.filter((candidate) => candidate !== value) : [...values, value];
}

export function toggledOrUnset<T>(values: readonly T[] | undefined, value: T): T[] | undefined {
  const next = toggled(values ?? [], value);
  return next.length > 0 ? next : undefined;
}

export function withTagToggled(params: ListParams, tag: string): ListParams {
  return { ...params, filter: { ...params.filter, tags: toggledOrUnset(params.filter.tags, tag) } };
}
