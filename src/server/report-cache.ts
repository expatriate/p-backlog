export type ReportCache = {
  get: <T>(key: string, compute: () => Promise<T>, tags?: readonly string[]) => Promise<T>;
  clear: () => void;
  clearTagged: (tags: readonly string[]) => void;
};

export function createReportCache({ ttlMs, now }: { ttlMs: number; now: () => number }): ReportCache {
  let entries = new Map<string, { at: number; value: Promise<unknown>; tags: readonly string[] }>();
  return {
    get: <T>(key: string, compute: () => Promise<T>, tags: readonly string[] = []): Promise<T> => {
      const cached = entries.get(key);
      if (cached !== undefined && now() - cached.at <= ttlMs) return cached.value as Promise<T>;
      const value = compute();
      entries.set(key, { at: now(), value, tags });
      value.catch(() => {
        if (entries.get(key)?.value === value) entries.delete(key);
      });
      return value;
    },
    clear: () => {
      entries = new Map();
    },
    clearTagged: (tags) => {
      const tagged = new Set(tags);
      for (const [key, entry] of entries) if (entry.tags.some((tag) => tagged.has(tag))) entries.delete(key);
    },
  };
}
