import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import { journalEventSchema, type JournalEvent, type ProjectJournal } from "../journal/events";
import { errorText } from "../errors";
import { readJsonLines } from "./fs-utils";

export const JOURNAL_FILE = "journal.jsonl";

export async function appendJournal(projectDir: string, events: readonly JournalEvent[]): Promise<void> {
  if (events.length === 0) return;
  const path = join(projectDir, JOURNAL_FILE);
  try {
    await appendFile(path, events.map((event) => `${JSON.stringify(event)}\n`).join(""), "utf8");
  } catch (error) {
    console.error(`Не удалось записать журнал ${path}: ${errorText(error)}`);
  }
}

export async function readJournal(projectDir: string, projectId: string): Promise<ProjectJournal> {
  const { values, invalidLines } = await readJsonLines(join(projectDir, JOURNAL_FILE), journalEventSchema);
  return { projectId, events: values, invalidLines };
}

export async function readJournals(root: string, projectIds: readonly string[]): Promise<ProjectJournal[]> {
  return Promise.all(projectIds.map((projectId) => readJournal(join(root, projectId), projectId)));
}
