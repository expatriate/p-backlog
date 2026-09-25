import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import { basename } from "node:path";
import type { Revision } from "../core/api/contract";
import { contentVersion, readTextOrNull } from "../core/store/fs-utils";
import { JOURNAL_FILE } from "../core/store/journal";

export type OwnWrite = { path: string; version: string };

export type Revisions = {
  current: () => Revision;
  recordOwnWrites: (writes: readonly OwnWrite[]) => Promise<void>;
  settle: (paths: readonly string[]) => Promise<"own" | "foreign">;
};

type FileMark = { version: string; mtimeMs: number };

export function createRevisions(boot: string = randomUUID()): Revisions {
  let seq = 0;
  const ownMarks = new Map<string, FileMark>();

  const isOwn = async (path: string): Promise<boolean> => {
    if (basename(path) === JOURNAL_FILE) return true;
    const expected = ownMarks.get(path);
    ownMarks.delete(path);
    if (expected === undefined) return false;
    const actual = await markOf(path);
    return actual !== null && actual.version === expected.version && actual.mtimeMs === expected.mtimeMs;
  };

  return {
    current: () => ({ boot, seq }),
    recordOwnWrites: async (writes) => {
      const marks = await Promise.all(writes.map(async ({ path }) => ({ path, mark: await markOf(path) })));
      seq += 1;
      marks.forEach(({ path, mark }, index) => {
        if (mark !== null && mark.version === writes[index]?.version) ownMarks.set(path, mark);
        else ownMarks.delete(path);
      });
    },
    settle: async (paths) => {
      const own = paths.length > 0 && (await Promise.all(paths.map((path) => isOwn(path).catch(() => false)))).every(Boolean);
      if (own) return "own";
      seq += 1;
      return "foreign";
    },
  };
}

async function markOf(path: string): Promise<FileMark | null> {
  const [text, stats] = await Promise.all([readTextOrNull(path), stat(path).catch(() => null)]);
  return text === null || stats === null ? null : { version: contentVersion(text), mtimeMs: stats.mtimeMs };
}
