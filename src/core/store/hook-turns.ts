import { join } from "node:path";
import { z } from "zod";
import { withFileLock } from "./file-lock";
import { readJsonFile, writeJsonFile } from "./fs-utils";

const HOOK_TURNS_FILE = ".hook-turns.json";
const TURN_RETENTION_MS = 24 * 60 * 60 * 1000;

const hookTurnsSchema = z.record(z.string(), z.iso.datetime({ offset: true }));

export async function claimHookTurn(backlogRoot: string, turnKey: string, now: Date): Promise<boolean> {
  const path = join(backlogRoot, HOOK_TURNS_FILE);
  return withFileLock(path, async () => {
    const turns = (await readJsonFile(path, hookTurnsSchema)) ?? {};
    if (turns[turnKey] !== undefined) return false;
    const recent = Object.entries(turns).filter(([, at]) => now.getTime() - Date.parse(at) < TURN_RETENTION_MS);
    await writeJsonFile(path, { ...Object.fromEntries(recent), [turnKey]: now.toISOString() });
    return true;
  });
}
