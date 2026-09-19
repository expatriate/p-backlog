export type ReportCache = {
  get: <T>(key: string, compute: () => Promise<T>) => Promise<T>;
  clear: () => void;
};

export function createReportCache({ ttlMs, now }: { ttlMs: number; now: () => number }): ReportCache {
  let entries = new Map<string, { at: number; value: Promise<unknown> }>();
  return {
    get: <T>(key: string, compute: () => Promise<T>): Promise<T> => {
      const cached = entries.get(key);
      if (cached !== undefined && now() - cached.at <= ttlMs) return cached.value as Promise<T>;
      const generation = entries;
      const value = compute();
      generation.set(key, { at: now(), value });
      value.catch(() => generation.delete(key));
      return value;
    },
    clear: () => {
      entries = new Map();
    },
  };
}
