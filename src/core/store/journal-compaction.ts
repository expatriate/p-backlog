import { join } from "node:path";
import { episodeOpeners, journalEventSchema, type JournalEvent } from "../journal/events";
import { retainedSince } from "../model/lifecycle";
import { withFileLock } from "./file-lock";
import { parseJson, readTextOrNull, writeFileAtomic } from "./fs-utils";
import { JOURNAL_FILE } from "./journal";

type JournalLine = { text: string; event: JournalEvent | null };

const EPISODE_KINDS: ReadonlySet<JournalEvent["kind"]> = new Set(["candidate", "candidate-gone", "candidate-filtered", "verified"]);

export async function compactJournal(projectDir: string, liveTaskIds: ReadonlySet<string>, now: Date): Promise<number> {
  const path = join(projectDir, JOURNAL_FILE);
  return withFileLock(path, async () => {
    const lines = journalLines((await readTextOrNull(path)) ?? "");
    const kept = retainedLines(lines, liveTaskIds, retainedSince(now));
    const removed = lines.length - kept.length;
    if (removed > 0) await writeFileAtomic(path, kept.map(({ text }) => `${text}\n`).join(""));
    return removed;
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
  const openers = episodeOpeners(events);
  const anchor = earliestEvent(events);
  const lastSeen = lastMomentByTask(events);
  const firstRecent = lines.findIndex(({ event }) => event !== null && Date.parse(event.at) >= since);
  return lines.filter(({ event }, position) => {
    if (event === null) return firstRecent !== -1 && position > firstRecent;
    if (event === anchor || openers.has(event)) return true;
    const recent = Date.parse(event.at) >= since;
    if (EPISODE_KINDS.has(event.kind)) return recent;
    return recent || liveTaskIds.has(event.task) || (lastSeen.get(event.task) ?? 0) >= since;
  });
}

function earliestEvent(events: readonly JournalEvent[]): JournalEvent | undefined {
  return events.reduce<JournalEvent | undefined>((earliest, event) => (earliest === undefined || Date.parse(event.at) < Date.parse(earliest.at) ? event : earliest), undefined);
}

function lastMomentByTask(events: readonly JournalEvent[]): Map<string, number> {
  const lastSeen = new Map<string, number>();
  for (const event of events) lastSeen.set(event.task, Math.max(lastSeen.get(event.task) ?? 0, Date.parse(event.at)));
  return lastSeen;
}
