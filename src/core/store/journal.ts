import { join } from "node:path";
import { journalEventSchema, type JournalEvent, type ProjectJournal } from "../journal/events";
import type { PathErrorHandler } from "../errors";
import { SECOND_MS } from "../model/dates";
import { REPLACE_RETRIES_TOTAL_MS } from "./atomic-write";
import { FileBusyError, withFileLock } from "./file-lock";
import { appendJsonLines, readJsonLines, type JsonLines } from "./json-lines";

export const JOURNAL_FILE = "journal.jsonl";

export async function appendJournal(projectDir: string, events: readonly JournalEvent[], onError: PathErrorHandler): Promise<void> {
  if (events.length === 0) return;
  const path = join(projectDir, JOURNAL_FILE);
  try {
    await appendWaitingForLock(path, events);
  } catch (error) {
    onError(path, error);
  }
}

export const JOURNAL_LOCK_WAIT_MS = REPLACE_RETRIES_TOTAL_MS + 10 * SECOND_MS;

async function appendWaitingForLock(path: string, events: readonly JournalEvent[]): Promise<void> {
  try {
    await withFileLock(path, () => appendJsonLines(path, events), { waitLimitMs: JOURNAL_LOCK_WAIT_MS });
  } catch (error) {
    if (!(error instanceof FileBusyError)) throw error;
    // A command must not hang on a stuck journal lock; the wait above outlasts a rewrite with all its Windows rename retries.
    await appendJsonLines(path, events);
  }
}

export type JournalWriter = (projectDir: string, events: readonly JournalEvent[]) => Promise<void>;

export function appendingJournal(onError: PathErrorHandler): JournalWriter {
  return (projectDir, events) => appendJournal(projectDir, events, onError);
}

export function undoJournal(write: JournalWriter): JournalWriter {
  return (projectDir, events) => write(projectDir, events.map(markedUndo));
}

function markedUndo(event: JournalEvent): JournalEvent {
  return { ...event, undo: true };
}

export function bufferedJournal(target: JournalWriter): { write: JournalWriter; flush: () => Promise<void> } {
  const pending = new Map<string, JournalEvent[]>();
  return {
    write: async (projectDir, events) => {
      pending.set(projectDir, [...(pending.get(projectDir) ?? []), ...events]);
    },
    flush: async () => {
      for (const [projectDir, events] of pending) await target(projectDir, events);
      pending.clear();
    },
  };
}

export async function readJournal(projectDir: string, projectId: string): Promise<ProjectJournal> {
  return projectJournal(projectId, await readJsonLines(join(projectDir, JOURNAL_FILE), journalEventSchema));
}

export function projectJournal(projectId: string, { values, invalidLines }: JsonLines<JournalEvent>): ProjectJournal {
  return { projectId, events: values, invalidLines };
}

export async function readJournals(root: string, projectIds: readonly string[]): Promise<ProjectJournal[]> {
  return Promise.all(projectIds.map((projectId) => readJournal(join(root, projectId), projectId)));
}
