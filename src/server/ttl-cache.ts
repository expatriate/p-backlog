import { forgetIfRejected } from "./source-memos";

export type TtlCache = {
  get: <T>(key: string, compute: () => Promise<T>, tags?: readonly string[]) => Promise<T>;
  clear: () => void;
  clearTagged: (tags: readonly string[]) => void;
  size: () => number;
};

export function createTtlCache({ ttlMs, now }: { ttlMs: number; now: () => number }): TtlCache {
  const entries = new Map<string, { at: number; value: Promise<unknown>; tags: readonly string[] }>();
  const evictExpired = (moment: number) => {
    for (const [key, entry] of entries) if (moment - entry.at > ttlMs) entries.delete(key);
  };
  return {
    get: <T>(key: string, compute: () => Promise<T>, tags: readonly string[] = []): Promise<T> => {
      const moment = now();
      evictExpired(moment);
      const cached = entries.get(key);
      if (cached !== undefined) return cached.value as Promise<T>;
      const value = compute();
      entries.set(key, { at: moment, value, tags });
      forgetIfRejected(entries, key, value);
      return value;
    },
    clear: () => entries.clear(),
    clearTagged: (tags) => {
      const tagged = new Set(tags);
      for (const [key, entry] of entries) if (entry.tags.some((tag) => tagged.has(tag))) entries.delete(key);
    },
    size: () => entries.size,
  };
}
