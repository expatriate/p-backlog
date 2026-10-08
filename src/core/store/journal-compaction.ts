import { join } from "node:path";
import { episodeOpeners } from "../journal/episodes";
import { journalEventSchema, type JournalEvent } from "../journal/events";
import { taskHistories, type TaskHistory } from "../stats/history";
import { runWhenDue } from "./daily";
import { withFileLock } from "./file-lock";
import { fileExists, NEWLINE, parseJson, readBytesOrNull, replacePrefixAtomic } from "./fs-utils";
import { JOURNAL_FILE } from "./journal";
import { projectDirNames, taskIdsOnDisk } from "./load";
import { retainedSince } from "../model/history-window";

const COMPACTED_STAMP = ".journal-compacted-at";

type JournalLine = { text: string; event: JournalEvent | null };

const EPISODE_KINDS: ReadonlySet<JournalEvent["kind"]> = new Set(["candidate", "candidate-gone", "candidate-filtered", "verified"]);

export type CompactionFailed = (dir: string, error: unknown) => void;

export async function compactJournalsWhenDue(root: string, now: Date, failed: CompactionFailed): Promise<string[]> {
  const compacted: string[] = [];
  for (const name of await projectDirNames(root)) {
    const dir = join(root, name);
    const removed = await compactProjectWhenDue(dir, now).catch((error: unknown) => {
      failed(dir, error);
      return null;
    });
    if (removed !== null && removed > 0) compacted.push(name);
  }
  return compacted;
}

async function compactProjectWhenDue(dir: string, now: Date): Promise<number | null> {
  if (!(await fileExists(join(dir, JOURNAL_FILE)))) return null;
  return runWhenDue(join(dir, COMPACTED_STAMP), now, async () => compactJournal(dir, await taskIdsOnDisk(dir), now));
}

export async function compactJournal(projectDir: string, liveTaskIds: ReadonlySet<string>, now: Date): Promise<number> {
  const path = join(projectDir, JOURNAL_FILE);
  if (!(await fileExists(path))) return 0;
  return withFileLock(path, async () => {
    const journal = (await readBytesOrNull(path)) ?? Buffer.alloc(0);
    const completeLines = journal.subarray(0, journal.lastIndexOf(NEWLINE) + 1);
    const lines = journalLines(completeLines.toString("utf8"));
    const kept = retainedLines(lines, liveTaskIds, retainedSince(now));
    const removed = lines.length - kept.length;
    const replaced = removed > 0 && (await replacePrefixAtomic(path, completeLines, kept.map(({ text }) => `${text}\n`).join("")));
    return replaced ? removed : 0;
  });
}

function journalLines(text: string): JournalLine[] {
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => ({ text: line, event: parseJson(line, journalEventSchema) }));
}

function retainedLines(lines: readonly JournalLine[], liveTaskIds: ReadonlySet<string>, since: number): JournalLine[] {
  const events = lines.flatMap(({ event }) => (event === null ? [] : [event]));
  const isRecent = (event: JournalEvent) => Date.parse(event.at) >= since;
  const lastSeen = lastMomentByTask(events);
  const keepsHistory = (task: string) => liveTaskIds.has(task) || (lastSeen.get(task) ?? 0) >= since;
  const anchors = anchorEvents(events, keepsHistory);
  const openers = episodeOpeners(events);
  const firstRecent = lines.findIndex(({ event }) => event !== null && isRecent(event));
  return lines.filter(({ event }, position) => {
    if (event === null) return firstRecent !== -1 && position > firstRecent;
    if (anchors.has(event) || (openers.has(event) && liveTaskIds.has(event.task))) return true;
    return EPISODE_KINDS.has(event.kind) ? isRecent(event) : keepsHistory(event.task);
  });
}

function anchorEvents(events: readonly JournalEvent[], keepsHistory: (task: string) => boolean): Set<JournalEvent> {
  const earliest = earliestEvent(events);
  const oldestDropped = oldestTask(events.filter((event) => !keepsHistory(event.task)));
  const oldestDroppedLife = events.filter((event) => event.task === oldestDropped && (event.kind === "created" || event.kind === "deleted"));
  return new Set([...(earliest === undefined ? [] : [earliest]), ...oldestDroppedLife]);
}

function oldestTask(events: readonly JournalEvent[]): string | undefined {
  const tasks = taskHistories([], [{ projectId: "", events, invalidLines: 0 }]).filter((history) => history.type === "task");
  return tasks.reduce<TaskHistory | undefined>((oldest, history) => (oldest === undefined || history.createdAt < oldest.createdAt ? history : oldest), undefined)?.id;
}

function earliestEvent(events: readonly JournalEvent[]): JournalEvent | undefined {
  return events.reduce<JournalEvent | undefined>((earliest, event) => (earliest === undefined || Date.parse(event.at) < Date.parse(earliest.at) ? event : earliest), undefined);
}

function lastMomentByTask(events: readonly JournalEvent[]): Map<string, number> {
  const lastSeen = new Map<string, number>();
  for (const event of events) lastSeen.set(event.task, Math.max(lastSeen.get(event.task) ?? 0, Date.parse(event.at)));
  return lastSeen;
}
