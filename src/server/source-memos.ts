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

export function pruneUnlessKept<K extends string | undefined>(map: Map<K, unknown>, projectIds: readonly string[]): void {
  const kept = new Set<string | undefined>(projectIds);
  for (const projectId of map.keys()) if (projectId !== undefined && !kept.has(projectId)) map.delete(projectId);
}

export function forgetIfRejected<K>(entries: Pick<Map<K, { value: unknown }>, "get" | "delete">, key: K, value: unknown): void {
  if (!(value instanceof Promise)) return;
  value.catch(() => {
    if (entries.get(key)?.value === value) entries.delete(key);
  });
}

export type ScopeMemo<V> = {
  get: (key: string, compute: () => V, projectId?: string) => V;
  retain: (projectIds: readonly string[]) => void;
};

export function createScopeMemo<V>(): ScopeMemo<V> {
  const slots = new Map<string | undefined, { key: string; value: V }>();
  return {
    get: (key, compute, projectId) => {
      const remembered = slots.get(projectId);
      if (remembered?.key === key) return remembered.value;
      const value = compute();
      slots.set(projectId, { key, value });
      forgetIfRejected(slots, projectId, value);
      return value;
    },
    retain: (projectIds) => pruneUnlessKept(slots, projectIds),
  };
}
