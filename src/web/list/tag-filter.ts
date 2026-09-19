export function toggledTags(tags: readonly string[], tag: string): string[] | undefined {
  const next = tags.includes(tag) ? tags.filter((candidate) => candidate !== tag) : [...tags, tag];
  return next.length > 0 ? next : undefined;
}
