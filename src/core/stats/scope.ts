import type { ProjectJournal } from "../journal/events";
import { formatLocalIso } from "../model/dates";
import type { Task } from "../model/types";
import { taskHistories, type TaskHistory } from "./history";

export type StatsInput = { tasks: readonly Task[]; journals: readonly ProjectJournal[]; now: Date; projectId?: string };

export type StatsScope = {
  tasks: Task[];
  histories: TaskHistory[];
  journalStart: number | null;
  journalSince: string | null;
  invalidJournalLines: number;
};

export function statsScope({ tasks, journals, projectId }: StatsInput): StatsScope {
  const inScope = (candidate: string) => projectId === undefined || candidate === projectId;
  const scopedJournals = journals.filter((journal) => inScope(journal.projectId));
  const moments = scopedJournals.flatMap((journal) => journal.events.map((event) => Date.parse(event.at)));
  const journalStart = moments.length === 0 ? null : moments.reduce((min, moment) => Math.min(min, moment));
  return {
    tasks: tasks.filter((task) => inScope(task.projectId)),
    histories: taskHistories(tasks, scopedJournals).filter((history) => inScope(history.projectId)),
    journalStart,
    journalSince: journalStart === null ? null : formatLocalIso(new Date(journalStart)),
    invalidJournalLines: scopedJournals.reduce((sum, journal) => sum + journal.invalidLines, 0),
  };
}
