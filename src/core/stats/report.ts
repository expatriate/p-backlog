import { formatLocalIso } from "../model/dates";
import { isClosed } from "../model/graph";
import { DAY_MS } from "../model/lifecycle";
import type { Priority, Task } from "../model/types";
import type { ProjectJournal } from "../store/journal";
import { ageBreakdown, closingBreakdown, hotspots } from "./breakdowns";
import { closingsOf, taskHistories, type TaskHistory } from "./history";
import { daysBetween, median, nearestRank } from "./numbers";
import type { StatsReport, StatsTotals } from "./types";
import { STATS_WEEKS, weekStarts, weeklyFlow } from "./weeks";

export const PRIORITY_WEIGHT: Record<Priority, number> = { critical: 8, high: 4, medium: 2, low: 1 };

const STALE_DAYS = 30;
const LEAD_TIME_TAIL = 0.9;
const LAST_WEEK_MS = 7 * DAY_MS;

export type StatsInput = { tasks: readonly Task[]; journals: readonly ProjectJournal[]; now: Date; projectId?: string };

export function statsReport({ tasks, journals, now, projectId }: StatsInput): StatsReport {
  const inScope = (candidate: string) => projectId === undefined || candidate === projectId;
  const scopedJournals = journals.filter((journal) => inScope(journal.projectId));
  const histories = taskHistories(tasks, scopedJournals).filter((history) => history.type === "task" && inScope(history.projectId));
  const openTasks = tasks.filter((task) => task.type === "task" && inScope(task.projectId) && !isClosed(task.status));
  const periodStart = weekStarts(now, STATS_WEEKS)[0]?.getTime() ?? now.getTime();
  const eventMoments = scopedJournals.flatMap((journal) => journal.events.map((event) => Date.parse(event.at)));

  return {
    taskCount: histories.length,
    journalSince: eventMoments.length === 0 ? null : formatLocalIso(new Date(Math.min(...eventMoments))),
    invalidJournalLines: scopedJournals.reduce((sum, journal) => sum + journal.invalidLines, 0),
    totals: totals(openTasks, histories, now, periodStart),
    weeks: weeklyFlow(histories, now),
    hotspots: hotspots(openTasks, projectId === undefined),
    age: ageBreakdown(openTasks, now),
    closing: closingBreakdown(histories, periodStart, now.getTime()),
  };
}

function totals(openTasks: readonly Task[], histories: readonly TaskHistory[], now: Date, periodStart: number): StatsTotals {
  const nowMs = now.getTime();
  const inLastWeek = (moment: number) => moment > nowMs - LAST_WEEK_MS && moment <= nowMs;
  const ages = openTasks.map((task) => daysBetween(Date.parse(task.created), nowMs));
  const leadTimes = histories.flatMap((history) =>
    closingsOf(history)
      .filter((closing) => closing.at >= periodStart && closing.at <= nowMs)
      .map((closing) => daysBetween(history.createdAt, closing.at)),
  );
  return {
    open: openTasks.length,
    openWeight: openTasks.reduce((sum, task) => sum + PRIORITY_WEIGHT[task.priority], 0),
    createdLastWeek: histories.filter((history) => inLastWeek(history.createdAt)).length,
    closedLastWeek: histories.flatMap(closingsOf).filter((closing) => inLastWeek(closing.at)).length,
    ageMedianDays: median(ages),
    olderThan30Days: ages.filter((age) => age >= STALE_DAYS).length,
    leadTimeMedianDays: median(leadTimes),
    leadTimeP90Days: nearestRank(leadTimes, LEAD_TIME_TAIL),
  };
}
