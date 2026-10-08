import { randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import type { Revision } from "../core/api/contract";
import { contentVersion } from "../core/store/fs-utils";

export type OwnWrite = { path: string; version: string };

export type Revisions = {
  current: () => Revision;
  recordOwnWrites: (writes: readonly OwnWrite[], appended: readonly string[]) => Promise<void>;
  settle: (paths: readonly string[]) => Promise<"own" | "foreign">;
};

type FileMark = { version: string; mtimeMs: number };

export function createRevisions(): Revisions {
  const boot = randomUUID();
  let seq = 0;
  const ownMarks = new Map<string, FileMark>();

  const consumeOwnMark = async (path: string): Promise<boolean> => {
    const expected = ownMarks.get(path);
    ownMarks.delete(path);
    if (expected === undefined) return false;
    const actual = await markIfReadable(path);
    return actual !== null && actual.version === expected.version && actual.mtimeMs === expected.mtimeMs;
  };

  return {
    current: () => ({ boot, seq }),
    recordOwnWrites: async (writes, appended) => {
      const expected = [...writes, ...appended.map((path) => ({ path, version: undefined }))];
      const marks = await Promise.all(expected.map(async ({ path, version }) => ({ path, version, mark: await markIfReadable(path) })));
      seq += 1;
      for (const { path, version, mark } of marks) {
        if (mark !== null && (version === undefined || mark.version === version)) ownMarks.set(path, mark);
        else ownMarks.delete(path);
      }
    },
    settle: async (paths) => {
      const own = paths.length > 0 && (await Promise.all(paths.map(consumeOwnMark))).every(Boolean);
      if (own) return "own";
      seq += 1;
      return "foreign";
    },
  };
}

async function markOf(path: string): Promise<FileMark> {
  const [text, stats] = await Promise.all([readFile(path, "utf8"), stat(path)]);
  return { version: contentVersion(text), mtimeMs: stats.mtimeMs };
}

function markIfReadable(path: string): Promise<FileMark | null> {
  // eslint-disable-next-line no-restricted-syntax -- a file we cannot read never proves a write was ours: it counts as foreign, and the reload reports the error
  return markOf(path).catch(() => null);
}
