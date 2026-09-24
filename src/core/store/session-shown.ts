import { join } from "node:path";
import { z } from "zod";
import { withFileLock } from "./file-lock";
import { readJsonFile, writeJsonFile } from "./fs-utils";

const SESSION_SHOWN_FILE = ".candidates-shown.json";
const SESSION_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

const sessionsShownSchema = z.record(z.string(), z.object({ tasks: z.array(z.string()), at: z.iso.datetime({ offset: true }) }));

type SessionsShown = z.infer<typeof sessionsShownSchema>;

export async function readSessionShown(projectDir: string, session: string): Promise<string[]> {
  return (await readSessions(projectDir))[session]?.tasks ?? [];
}

export async function rememberSessionShown(projectDir: string, session: string, taskIds: readonly string[], now: Date): Promise<void> {
  const path = join(projectDir, SESSION_SHOWN_FILE);
  await withFileLock(path, async () => {
    const sessions = await readSessions(projectDir);
    const recent = Object.entries(sessions).filter(([, shown]) => now.getTime() - Date.parse(shown.at) < SESSION_RETENTION_MS);
    const tasks = [...new Set([...(sessions[session]?.tasks ?? []), ...taskIds])];
    await writeJsonFile(path, { ...Object.fromEntries(recent), [session]: { tasks, at: now.toISOString() } });
  });
}

async function readSessions(projectDir: string): Promise<SessionsShown> {
  return (await readJsonFile(join(projectDir, SESSION_SHOWN_FILE), sessionsShownSchema)) ?? {};
}
