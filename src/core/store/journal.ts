import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import { journalEventSchema, type JournalEvent, type ProjectJournal } from "../journal/events";
import { readTextOrNull } from "./fs-utils";

export const JOURNAL_FILE = "journal.jsonl";

export async function appendJournal(projectDir: string, events: readonly JournalEvent[]): Promise<void> {
  if (events.length === 0) return;
  const path = join(projectDir, JOURNAL_FILE);
  try {
    await appendFile(path, events.map((event) => `${JSON.stringify(event)}\n`).join(""), "utf8");
  } catch (error) {
    console.error(`Не удалось записать журнал ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function readJournal(projectDir: string, projectId: string): Promise<ProjectJournal> {
  const text = (await readTextOrNull(join(projectDir, JOURNAL_FILE))) ?? "";
  const parsed = text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map(parseEvent);
  const events = parsed.filter((event): event is JournalEvent => event !== null);
  return { projectId, events, invalidLines: parsed.length - events.length };
}

export async function readJournals(root: string, projectIds: readonly string[]): Promise<ProjectJournal[]> {
  return Promise.all(projectIds.map((projectId) => readJournal(join(root, projectId), projectId)));
}

function parseEvent(line: string): JournalEvent | null {
  try {
    const parsed = journalEventSchema.safeParse(JSON.parse(line));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
