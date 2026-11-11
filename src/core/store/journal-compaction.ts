import { basename, join } from "node:path";
import { groupBy } from "../collections";
import type { PathErrorHandler } from "../errors";
import { taskCreation } from "../journal/creation";
import { episodeOpeners } from "../journal/episodes";
import { journalEventSchema, type JournalEvent } from "../journal/events";
import { runWhenDue } from "./daily";
import { withWriteLock } from "./file-lock";
import { fileExists, NEWLINE, readBytesOrNull } from "./fs-utils";
import { parseJson } from "./json-file";
import { replacePrefixAtomic } from "./atomic-write";
import { JOURNAL_FILE } from "./journal";
import { projectDirNames, taskIdsOnDisk } from "./load";
import { retainedSince } from "../model/history-window";
import { parseId } from "../model/ids";
import { PROJECT_FILE } from "./paths";
import { reserveIssuedUpTo } from "./projects";
import type { WriteContext } from "./write-context";

export const COMPACTED_STAMP = ".journal-compacted-at";

type JournalLine = { text: string; event: JournalEvent | null };

const EPISODE_KINDS: ReadonlySet<JournalEvent["kind"]> = new Set(["candidate", "candidate-gone", "candidate-filtered", "verified"]);

export async function compactJournalsWhenDue(root: string, writes: WriteContext, onNotCompacted: PathErrorHandler): Promise<string[]> {
  const compacted: string[] = [];
  for (const name of await projectDirNames(root)) {
    const dir = join(root, name);
    const removed = await compactProjectWhenDue(dir, writes).catch((error: unknown) => {
      onNotCompacted(dir, error);
      return null;
    });
    if (removed !== null && removed > 0) compacted.push(name);
  }
  return compacted;
}

async function compactProjectWhenDue(dir: string, writes: WriteContext): Promise<number | null> {
  if (!(await fileExists(join(dir, JOURNAL_FILE)))) return null;
  return runWhenDue(join(dir, COMPACTED_STAMP), writes, async () => compactJournal(dir, await taskIdsOnDisk(dir), writes));
}

export async function compactJournal(projectDir: string, liveTaskIds: ReadonlySet<string>, { now, onError }: WriteContext): Promise<number> {
  const path = join(projectDir, JOURNAL_FILE);
  if (!(await fileExists(path))) return 0;
  return withWriteLock(
    path,
    async (afterPublish) => {
      const journal = (await readBytesOrNull(path)) ?? Buffer.alloc(0);
      const completeLines = journal.subarray(0, journal.lastIndexOf(NEWLINE) + 1);
      const lines = journalLines(completeLines.toString("utf8"));
      const kept = retainedLines(lines, liveTaskIds, retainedSince(now));
      const keptLines = new Set(kept);
      const dropped = lines.filter((line) => !keptLines.has(line));
      if (dropped.length === 0 || !(await reserveDroppedNumbers(projectDir, dropped, onError))) return 0;
      const replaced = await replacePrefixAtomic(path, completeLines, kept.map(({ text }) => `${text}\n`).join(""), afterPublish);
      return replaced ? dropped.length : 0;
    },
    { onErrorAfterPublish: onError },
  );
}

async function reserveDroppedNumbers(projectDir: string, dropped: readonly JournalLine[], onError: PathErrorHandler): Promise<boolean> {
  const highest = dropped.reduce((max, { event }) => (event === null ? max : Math.max(max, parseId(event.task)?.number ?? 0)), 0);
  if (highest === 0) return true;
  const reservation = await reserveIssuedUpTo({ id: basename(projectDir), path: join(projectDir, PROJECT_FILE) }, highest, onError);
  return reservation.ok || reservation.reason === "not-found";
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
  const reportStarts = reportStartEvents(events, keepsHistory);
  const openers = episodeOpeners(events);
  const firstRecent = lines.findIndex(({ event }) => event !== null && isRecent(event));
  return lines.filter(({ event }, position) => {
    if (event === null) return firstRecent !== -1 && position > firstRecent;
    if (reportStarts.has(event) || (openers.has(event) && liveTaskIds.has(event.task))) return true;
    return EPISODE_KINDS.has(event.kind) ? isRecent(event) : keepsHistory(event.task);
  });
}

function reportStartEvents(events: readonly JournalEvent[], keepsHistory: (task: string) => boolean): Set<JournalEvent> {
  const journalSince = earliestEvent(events);
  const adoptionStart = oldestTask(events.filter((event) => !keepsHistory(event.task)));
  const adoptionStartLife = events.filter((event) => event.task === adoptionStart && (event.kind === "created" || event.kind === "deleted"));
  return new Set([...(journalSince === undefined ? [] : [journalSince]), ...adoptionStartLife]);
}

type CreatedTask = { task: string; createdAt: number };

function oldestTask(events: readonly JournalEvent[]): string | undefined {
  const tasks = [...groupBy(events, (event) => event.task)].flatMap(([task, taskEvents]): CreatedTask[] => {
    const creation = taskCreation(
      taskEvents.find((event) => event.kind === "deleted")?.snapshot,
      taskEvents.findLast((event) => event.kind === "created"),
    );
    return creation?.type === "task" ? [{ task, createdAt: creation.createdAt }] : [];
  });
  return tasks.reduce<CreatedTask | undefined>((oldest, candidate) => (oldest === undefined || candidate.createdAt < oldest.createdAt ? candidate : oldest), undefined)?.task;
}

function earliestEvent(events: readonly JournalEvent[]): JournalEvent | undefined {
  return events.reduce<JournalEvent | undefined>((earliest, event) => (earliest === undefined || Date.parse(event.at) < Date.parse(earliest.at) ? event : earliest), undefined);
}

function lastMomentByTask(events: readonly JournalEvent[]): Map<string, number> {
  const lastSeen = new Map<string, number>();
  for (const event of events) lastSeen.set(event.task, Math.max(lastSeen.get(event.task) ?? 0, Date.parse(event.at)));
  return lastSeen;
}
