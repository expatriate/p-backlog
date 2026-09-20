import { join } from "node:path";
import { z } from "zod";
import { parseJson, readTextOrNull, writeFileAtomic } from "./fs-utils";

export const SESSION_SHOWN_FILE = "candidates-shown.json";

export type SessionShown = { session: string; tasks: string[] };

const sessionShownSchema = z.object({ session: z.string(), tasks: z.array(z.string()) });

export async function readSessionShown(projectDir: string, session: string): Promise<SessionShown> {
  const text = await readTextOrNull(join(projectDir, SESSION_SHOWN_FILE));
  const stored = text === null ? null : parseJson(text, sessionShownSchema);
  return stored !== null && stored.session === session ? stored : { session, tasks: [] };
}

export async function writeSessionShown(projectDir: string, shown: SessionShown): Promise<void> {
  await writeFileAtomic(join(projectDir, SESSION_SHOWN_FILE), `${JSON.stringify(shown, null, 2)}\n`);
}
