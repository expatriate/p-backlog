import { join } from "node:path";
import { z } from "zod";
import { readJsonFile, writeJsonFile } from "./fs-utils";

const SESSION_SHOWN_FILE = ".candidates-shown.json";

export type SessionShown = { session: string; tasks: string[] };

const sessionShownSchema = z.object({ session: z.string(), tasks: z.array(z.string()) });

export async function readSessionShown(projectDir: string, session: string): Promise<SessionShown> {
  const stored = await readJsonFile(join(projectDir, SESSION_SHOWN_FILE), sessionShownSchema);
  return stored !== null && stored.session === session ? stored : { session, tasks: [] };
}

export async function writeSessionShown(projectDir: string, shown: SessionShown): Promise<void> {
  await writeJsonFile(join(projectDir, SESSION_SHOWN_FILE), shown);
}
