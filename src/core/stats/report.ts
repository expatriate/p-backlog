import { isClosed } from "../model/graph";
import { DAY_MS } from "../model/lifecycle";
import type { Priority, Task } from "../model/types";
import { ageBreakdown, closingBreakdown, hotspots } from "./breakdowns";
import { closingsOf, type TaskHistory } from "./history";
import { daysBetween, median, nearestRank } from "./numbers";
import { statsScope, type StatsInput } from "./scope";
import type { StatsReport, StatsTotals } from "./types";
import { periodStart, weeklyFlow } from "./weeks";

export const PRIORITY_WEIGHT: Record<Priority, number> = { critical: 8, high: 4, medium: 2, low: 1 };

const STALE_DAYS = 30;
const LEAD_TIME_TAIL = 0.9;
const LAST_WEEK_MS = 7 * DAY_MS;

export function statsReport(input: StatsInput): StatsReport {
  const { now, projectId } = input;
  const scope = statsScope(input);
  const histories = scope.histories.filter((history) => history.type === "task");
  const openTasks = scope.tasks.filter((task) => task.type === "task" && !isClosed(task.status));
  const start = periodStart(now);

  return {
    taskCount: histories.length,
    journalSince: scope.journalSince,
    invalidJournalLines: scope.invalidJournalLines,
    totals: totals(openTasks, histories, now, start),
    weeks: weeklyFlow(histories, now),
    hotspots: hotspots(openTasks, projectId === undefined),
    age: ageBreakdown(openTasks, now),
    closing: closingBreakdown(histories, start, now.getTime()),
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
