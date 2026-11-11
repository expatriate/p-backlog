import type { z } from "zod";
import type { AfterPublish } from "./atomic-write";
import { withWriteLock, type LockOptions } from "./file-lock";
import { readJsonFile, writeJsonFile } from "./json-file";

type JsonUpdateOutcome = "written" | "unchanged";

export function updateJsonUnderLock<T>(path: string, schema: z.ZodType<T>, empty: T, update: (current: T) => T | null, options: AfterPublish & LockOptions): Promise<JsonUpdateOutcome> {
  return withWriteLock(
    path,
    async (afterPublish) => {
      const next = update((await readJsonFile(path, schema)) ?? empty);
      if (next === null) return "unchanged";
      await writeJsonFile(path, next, afterPublish);
      return "written";
    },
    options,
  );
}
