import { useCallback, useMemo, useSyncExternalStore } from "react";
import { z } from "zod";

type StoredSchema<T> = z.ZodType<T, string>;

type StoredUpdate<T> = (stored: T | undefined) => T | undefined;

const listeners = new Set<() => void>();
const keptWithoutStorage = new Map<string, string>();

export function storedJson<T>(schema: z.ZodType<T>): StoredSchema<T> {
  return z.codec(z.string(), schema, {
    decode: (text, context) => {
      try {
        return JSON.parse(text);
      } catch {
        context.issues.push({ code: "custom", message: "stored value is not JSON", input: text });
        return z.NEVER;
      }
    },
    encode: (value) => JSON.stringify(value),
  });
}

export function useStoredValue<T>(key: string, schema: StoredSchema<T>): [T | undefined, (update: StoredUpdate<T>) => void] {
  const readKey = useCallback(() => readRaw(key), [key]);
  const raw = useSyncExternalStore(subscribe, readKey);
  const value = useMemo(() => decoded(schema, raw), [schema, raw]);
  const update = useCallback(
    (change: StoredUpdate<T>) => {
      const stored = decoded(schema, readRaw(key));
      const next = change(stored);
      if (next !== undefined && next !== stored) writeRaw(key, z.encode(schema, next));
    },
    [key, schema],
  );
  return [value, update];
}

function decoded<T>(schema: StoredSchema<T>, raw: string | null): T | undefined {
  if (raw === null) return undefined;
  const parsed = schema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function forgetValuesKeptWithoutStorage(): void {
  keptWithoutStorage.clear();
}

function readRaw(key: string): string | null {
  const kept = keptWithoutStorage.get(key);
  if (kept !== undefined) return kept;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeRaw(key: string, raw: string): void {
  try {
    window.localStorage.setItem(key, raw);
    keptWithoutStorage.delete(key);
  } catch {
    keptWithoutStorage.set(key, raw);
  }
  listeners.forEach((listener) => listener());
}
