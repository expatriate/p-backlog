export type CacheKey = { slot: string; state: string };

export type TtlCache = {
  get: <T>(key: CacheKey, compute: () => Promise<T>, tags?: readonly string[]) => Promise<T>;
  forgetAll: () => void;
  forgetTagged: (tags: readonly string[]) => void;
  size: () => number;
};

type Entry = { at: number; state: string; value: Promise<unknown>; tags: readonly string[] };

export function createTtlCache({ ttlMs, now }: { ttlMs: number; now: () => number }): TtlCache {
  const entries = new Map<string, Entry>();
  const forgetExpired = (moment: number) => {
    for (const [slot, entry] of entries) if (moment - entry.at > ttlMs) entries.delete(slot);
  };
  return {
    get: <T>({ slot, state }: CacheKey, compute: () => Promise<T>, tags: readonly string[] = []): Promise<T> => {
      const moment = now();
      forgetExpired(moment);
      const cached = entries.get(slot);
      if (cached?.state === state) return cached.value as Promise<T>;
      const value = compute();
      entries.set(slot, { at: moment, state, value, tags });
      value.catch(() => {
        if (entries.get(slot)?.value === value) entries.delete(slot);
      });
      return value;
    },
    forgetAll: () => entries.clear(),
    forgetTagged: (tags) => {
      const tagged = new Set(tags);
      for (const [slot, entry] of entries) if (entry.tags.some((tag) => tagged.has(tag))) entries.delete(slot);
    },
    size: () => entries.size,
  };
}
