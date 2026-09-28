export function toggled<T>(values: readonly T[], value: T): T[] {
  return values.includes(value) ? values.filter((candidate) => candidate !== value) : [...values, value];
}

export function emptyToUndefined<T>(values: T[]): T[] | undefined {
  return values.length > 0 ? values : undefined;
}

export function toggledTags(tags: readonly string[], tag: string): string[] | undefined {
  return emptyToUndefined(toggled(tags, tag));
}
