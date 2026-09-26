import { join } from "node:path";
import { journalEventSchema, type JournalEvent, type ProjectJournal } from "../journal/events";
import { errorText } from "../errors";
import { appendJsonLines, readJsonLines } from "./fs-utils";

export const JOURNAL_FILE = "journal.jsonl";

export async function appendJournal(projectDir: string, events: readonly JournalEvent[], onError: (path: string, error: unknown) => void = reportToStderr): Promise<void> {
  if (events.length === 0) return;
  const path = join(projectDir, JOURNAL_FILE);
  try {
    await appendJsonLines(path, events);
  } catch (error) {
    onError(path, error);
  }
}

export async function readJournal(projectDir: string, projectId: string): Promise<ProjectJournal> {
  return projectJournal(projectId, await readJsonLines(join(projectDir, JOURNAL_FILE), journalEventSchema));
}

export function projectJournal(projectId: string, { values, invalidLines }: { values: readonly JournalEvent[]; invalidLines: number }): ProjectJournal {
  return { projectId, events: values, invalidLines };
}

export async function readJournals(root: string, projectIds: readonly string[]): Promise<ProjectJournal[]> {
  return Promise.all(projectIds.map((projectId) => readJournal(join(root, projectId), projectId)));
}

function reportToStderr(path: string, error: unknown): void {
  console.error(`${path}: ${errorText(error)}`);
}
