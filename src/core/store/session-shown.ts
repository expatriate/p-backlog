import { join } from "node:path";
import { z } from "zod";
import { readJsonFile } from "./fs-utils";
import { updateJsonUnderLock } from "./json-under-lock";
import { formatLocalIso, WEEK_MS } from "../model/dates";

const SESSION_SHOWN_FILE = ".candidates-shown.json";
const SESSION_RETENTION_MS = WEEK_MS;

const sessionsShownSchema = z.record(z.string(), z.object({ tasks: z.array(z.string()), at: z.iso.datetime({ offset: true }) }));

export async function readSessionShown(projectDir: string, session: string): Promise<string[]> {
  const sessions = (await readJsonFile(join(projectDir, SESSION_SHOWN_FILE), sessionsShownSchema)) ?? {};
  return sessions[session]?.tasks ?? [];
}

export async function rememberSessionShown(projectDir: string, session: string, taskIds: readonly string[], now: Date): Promise<void> {
  await updateJsonUnderLock(join(projectDir, SESSION_SHOWN_FILE), sessionsShownSchema, {}, (sessions) => {
    const recent = Object.entries(sessions).filter(([, shown]) => now.getTime() - Date.parse(shown.at) < SESSION_RETENTION_MS);
    const tasks = [...new Set([...(sessions[session]?.tasks ?? []), ...taskIds])];
    return { ...Object.fromEntries(recent), [session]: { tasks, at: formatLocalIso(now) } };
  });
}
