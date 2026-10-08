import { join } from "node:path";
import { z } from "zod";
import { updateJsonUnderLock } from "./json-under-lock";
import { formatLocalIso } from "../model/dates";

const HOOK_TURNS_FILE = ".hook-turns.json";
const CLAIM_WINDOW_MS = 60_000;

const hookTurnsSchema = z.record(z.string(), z.iso.datetime({ offset: true }));

export async function claimHookTurn(backlogRoot: string, turnKey: string, now: Date): Promise<boolean> {
  const outcome = await updateJsonUnderLock(join(backlogRoot, HOOK_TURNS_FILE), hookTurnsSchema, {}, (turns) => {
    const claimed = Object.entries(turns).filter(([, at]) => now.getTime() - Date.parse(at) < CLAIM_WINDOW_MS);
    if (claimed.some(([key]) => key === turnKey)) return null;
    return { ...Object.fromEntries(claimed), [turnKey]: formatLocalIso(now) };
  });
  return outcome === "written";
}
