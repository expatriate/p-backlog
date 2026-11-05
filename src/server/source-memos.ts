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

export function retainProjects<K extends string | undefined>(map: Map<K, unknown>, projectIds: readonly string[]): void {
  const kept = new Set<string | undefined>(projectIds);
  for (const projectId of map.keys()) if (projectId !== undefined && !kept.has(projectId)) map.delete(projectId);
}

export type ScopeMemo<V> = {
  get: (state: string, compute: () => V, projectId?: string) => V;
  retain: (projectIds: readonly string[]) => void;
};

export function createScopeMemo<V>(): ScopeMemo<V> {
  const slots = new Map<string | undefined, { state: string; value: V }>();
  return {
    get: (state, compute, projectId) => {
      const remembered = slots.get(projectId);
      if (remembered?.state === state) return remembered.value;
      const value = compute();
      slots.set(projectId, { state, value });
      return value;
    },
    retain: (projectIds) => retainProjects(slots, projectIds),
  };
}
