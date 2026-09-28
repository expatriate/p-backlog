export function createSnapshotIds(): (snapshot: object) => number {
  const ids = new WeakMap<object, number>();
  let lastId = 0;
  return (snapshot) => {
    const known = ids.get(snapshot);
    if (known !== undefined) return known;
    lastId += 1;
    ids.set(snapshot, lastId);
    return lastId;
  };
}

export function pruneUnlessKept<K, V>(map: Map<K, V>, kept: ReadonlySet<string>, projectIdOf: (key: K, value: V) => string | undefined): void {
  for (const [key, value] of map) {
    const projectId = projectIdOf(key, value);
    if (projectId !== undefined && !kept.has(projectId)) map.delete(key);
  }
}
