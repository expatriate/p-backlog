import { join } from "node:path";
import { z } from "zod";
import { withFileLock } from "./file-lock";
import { readJsonFile, writeJsonFile } from "./fs-utils";

const HOOK_TURNS_FILE = ".hook-turns.json";
const CLAIM_WINDOW_MS = 60_000;

const hookTurnsSchema = z.record(z.string(), z.iso.datetime({ offset: true }));

export async function claimHookTurn(backlogRoot: string, turnKey: string, now: Date): Promise<boolean> {
  const path = join(backlogRoot, HOOK_TURNS_FILE);
  return withFileLock(path, async () => {
    const turns = (await readJsonFile(path, hookTurnsSchema)) ?? {};
    const claimed = Object.entries(turns).filter(([, at]) => now.getTime() - Date.parse(at) < CLAIM_WINDOW_MS);
    if (claimed.some(([key]) => key === turnKey)) return false;
    await writeJsonFile(path, { ...Object.fromEntries(claimed), [turnKey]: now.toISOString() });
    return true;
  });
}
