import { DAY_MS } from "../model/lifecycle";
import type { Priority, Task } from "../model/types";
import { ageBreakdown, closingBreakdown, hotspots } from "./breakdowns";
import { closingsOf, type TaskHistory } from "./history";
import { daysBetween, median, nearestRank, TAIL_FRACTION } from "./numbers";
import { reportBase, type ReportBase, type StatsInput } from "./scope";
import type { StatsReport, StatsTotals } from "./types";
import { periodStart, weeklyFlow } from "./weeks";

export const PRIORITY_WEIGHT: Record<Priority, number> = { critical: 8, high: 4, medium: 2, low: 1 };

const STALE_DAYS = 30;
const LAST_WEEK_MS = 7 * DAY_MS;

export function statsReport(input: StatsInput, base: ReportBase = reportBase(input)): StatsReport {
  const { now, projectId } = input;
  const { histories, openTasks } = base;
  const start = periodStart(now);

  return {
    ...base.head,
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
    leadTimeP90Days: nearestRank(leadTimes, TAIL_FRACTION),
  };
}
