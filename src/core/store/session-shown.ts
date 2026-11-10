import { join } from "node:path";
import { z } from "zod";
import { readJsonFile } from "./json-file";
import { updateJsonUnderLock } from "./json-under-lock";
import { formatLocalIso, WEEK_MS } from "../model/dates";
import type { WriteContext } from "./write-context";

const SESSION_SHOWN_FILE = ".candidates-shown.json";
const SESSION_RETENTION_MS = WEEK_MS;
const CODE_STATE_MARK = "@";

const sessionsShownSchema = z.record(z.string(), z.object({ tasks: z.array(z.string()), at: z.iso.datetime({ offset: true }) }));

export type ShownTask = { taskId: string; codeState: string | undefined };

export function shownKey({ taskId, codeState }: ShownTask): string {
  return codeState === undefined ? taskId : `${taskId}${CODE_STATE_MARK}${codeState}`;
}

function taskIdOf(key: string): string {
  return key.split(CODE_STATE_MARK, 1)[0] ?? key;
}

export async function readSessionShown(projectDir: string, session: string): Promise<string[]> {
  const sessions = (await readJsonFile(join(projectDir, SESSION_SHOWN_FILE), sessionsShownSchema)) ?? {};
  return sessions[session]?.tasks ?? [];
}

export async function rememberSessionShown(projectDir: string, session: string, shown: readonly ShownTask[], { now, onError }: WriteContext): Promise<void> {
  const shownAgain = new Set(shown.map(({ taskId }) => taskId));
  await updateJsonUnderLock(
    join(projectDir, SESSION_SHOWN_FILE),
    sessionsShownSchema,
    {},
    (sessions) => {
      const recent = Object.entries(sessions).filter(([, remembered]) => now.getTime() - Date.parse(remembered.at) < SESSION_RETENTION_MS);
      const otherTasks = (sessions[session]?.tasks ?? []).filter((key) => !shownAgain.has(taskIdOf(key)));
      return { ...Object.fromEntries(recent), [session]: { tasks: [...otherTasks, ...new Set(shown.map(shownKey))], at: formatLocalIso(now) } };
    },
    { onErrorAfterPublish: onError },
  );
}
