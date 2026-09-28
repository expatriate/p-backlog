import { hasUnknownValue, type ProjectJournal } from "../journal/events";
import { formatLocalIso } from "../model/dates";
import type { Task } from "../model/types";
import type { UnparsedTask } from "../store/load";
import { isClosed } from "../model/graph";
import { taskHistories, type TaskHistory } from "./history";
import { smallest, sum } from "../numbers";
import type { ReportHead } from "./types";

export type StatsInput = {
  tasks: readonly Task[];
  journals: readonly ProjectJournal[];
  now: Date;
  projectId?: string | undefined;
  unparsedTasks?: readonly UnparsedTask[] | undefined;
};

type StatsScope = {
  tasksWithEpics: Task[];
  historiesWithEpics: TaskHistory[];
  journalStart: number | null;
  journalSince: string | null;
  invalidJournalLines: number;
  unknownJournalLines: number;
  unparsedTasks: number;
};

function statsScope({ tasks, journals, projectId, unparsedTasks = [] }: StatsInput): StatsScope {
  const inScope = (candidate: string) => projectId === undefined || candidate === projectId;
  const scopedJournals = journals.filter((journal) => inScope(journal.projectId));
  const scopedTasks = tasks.filter((task) => inScope(task.projectId));
  const unparsedIds = new Set(unparsedTasks.filter((task) => inScope(task.projectId)).map((task) => task.id));
  const journalStart = smallest(scopedJournals.flatMap((journal) => journal.events.map((event) => Date.parse(event.at))));
  return {
    tasksWithEpics: scopedTasks,
    historiesWithEpics: taskHistories(scopedTasks, scopedJournals, unparsedIds),
    journalStart,
    journalSince: journalStart === null ? null : formatLocalIso(new Date(journalStart)),
    invalidJournalLines: sum(scopedJournals.map((journal) => journal.invalidLines)),
    unknownJournalLines: sum(scopedJournals.map((journal) => journal.events.filter(hasUnknownValue).length)),
    unparsedTasks: unparsedIds.size,
  };
}

export type ScopedReportData = { scope: StatsScope; histories: TaskHistory[]; tasks: Task[]; openTasks: Task[]; head: ReportHead };

export type ReportContext = ScopedReportData & { input: StatsInput };

export function scopedReportData(input: StatsInput): ScopedReportData {
  const scope = statsScope(input);
  const histories = scope.historiesWithEpics.filter((history) => history.type === "task");
  const tasks = scope.tasksWithEpics.filter((task) => task.type === "task");
  return {
    scope,
    histories,
    tasks,
    openTasks: tasks.filter((task) => !isClosed(task.status)),
    head: {
      taskCount: histories.length,
      journalSince: scope.journalSince,
      invalidJournalLines: scope.invalidJournalLines,
      unknownJournalLines: scope.unknownJournalLines,
      unparsedTasks: scope.unparsedTasks,
    },
  };
}

export function reportContext(input: StatsInput): ReportContext {
  return { ...scopedReportData(input), input };
}
