import type { z } from "zod";
import type { AfterPublish } from "./atomic-write";
import { withFileLock, type LockOptions } from "./file-lock";
import { readJsonFile, writeJsonFile } from "./json-file";

type JsonUpdateOutcome = "written" | "unchanged";

export function updateJsonUnderLock<T>(path: string, schema: z.ZodType<T>, empty: T, update: (current: T) => T | null, { onError, ...lockOptions }: AfterPublish & LockOptions): Promise<JsonUpdateOutcome> {
  return withFileLock(
    path,
    async () => {
      const next = update((await readJsonFile(path, schema)) ?? empty);
      if (next === null) return "unchanged";
      await writeJsonFile(path, next, { onError });
      return "written";
    },
    lockOptions,
  );
}
