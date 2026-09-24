import type { ProjectJournal } from "../journal/events";
import { formatLocalIso } from "../model/dates";
import type { Task } from "../model/types";
import type { UnparsedTask } from "../store/load";
import { isClosed } from "../model/graph";
import { taskHistories, type TaskHistory } from "./history";
import { smallest, sum } from "./numbers";
import type { ReportHead } from "./types";

export type StatsInput = {
  tasks: readonly Task[];
  journals: readonly ProjectJournal[];
  now: Date;
  projectId?: string | undefined;
  unparsedTasks?: readonly UnparsedTask[] | undefined;
};

type StatsScope = {
  tasks: Task[];
  histories: TaskHistory[];
  journalStart: number | null;
  journalSince: string | null;
  invalidJournalLines: number;
  unparsedTasks: number;
};

function statsScope({ tasks, journals, projectId, unparsedTasks = [] }: StatsInput): StatsScope {
  const inScope = (candidate: string) => projectId === undefined || candidate === projectId;
  const scopedJournals = journals.filter((journal) => inScope(journal.projectId));
  const scopedTasks = tasks.filter((task) => inScope(task.projectId));
  const unparsedIds = new Set(unparsedTasks.filter((task) => inScope(task.projectId)).map((task) => task.id));
  const journalStart = smallest(scopedJournals.flatMap((journal) => journal.events.map((event) => Date.parse(event.at))));
  return {
    tasks: scopedTasks,
    histories: taskHistories(scopedTasks, scopedJournals, unparsedIds).filter((history) => inScope(history.projectId)),
    journalStart,
    journalSince: journalStart === null ? null : formatLocalIso(new Date(journalStart)),
    invalidJournalLines: sum(scopedJournals.map((journal) => journal.invalidLines)),
    unparsedTasks: unparsedIds.size,
  };
}

export type ReportBase = { scope: StatsScope; histories: TaskHistory[]; tasks: Task[]; openTasks: Task[]; head: ReportHead };

export function reportBase(input: StatsInput): ReportBase {
  const scope = statsScope(input);
  const histories = scope.histories.filter((history) => history.type === "task");
  const tasks = scope.tasks.filter((task) => task.type === "task");
  return {
    scope,
    histories,
    tasks,
    openTasks: tasks.filter((task) => !isClosed(task.status)),
    head: { taskCount: histories.length, journalSince: scope.journalSince, invalidJournalLines: scope.invalidJournalLines, unparsedTasks: scope.unparsedTasks },
  };
}
