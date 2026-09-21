import { DAY_MS } from "../model/lifecycle";
import type { Task } from "../model/types";
import { ageBreakdown, closingBreakdown, hotspots } from "./breakdowns";
import { closingsOf, isOpenAt, type TaskHistory } from "./history";
import { daysBetween, median, nearestRank, TAIL_FRACTION } from "./numbers";
import { reportBase, type ReportBase, type StatsInput } from "./scope";
import { PRIORITY_WEIGHT } from "./weights";
import type { PreviousTotals, StatsReport, StatsTotals } from "./types";
import { dailyIntake } from "./days";
import { formatLocalDay } from "../model/dates";
import { periodStart, weeklyFlow } from "./weeks";

const STALE_DAYS = 30;
const LAST_WEEK_MS = 7 * DAY_MS;

export function statsReport(input: StatsInput, base: ReportBase = reportBase(input)): StatsReport {
  const { now, projectId } = input;
  const { histories, openTasks } = base;
  const start = periodStart(now);

  return {
    ...base.head,
    totals: totals(openTasks, histories, now, start, base.scope.journalStart),
    weeks: weeklyFlow(histories, now),
    days: dailyIntake(histories, now),
    hotspots: hotspots(openTasks, projectId === undefined),
    age: ageBreakdown(openTasks, now),
    closing: closingBreakdown(histories, start, now.getTime()),
  };
}

function totals(openTasks: readonly Task[], histories: readonly TaskHistory[], now: Date, periodStart: number, journalStart: number | null): StatsTotals {
  const nowMs = now.getTime();
  const inLastWeek = (moment: number) => moment > nowMs - LAST_WEEK_MS && moment <= nowMs;
  const ages = openTasks.map((task) => daysBetween(Date.parse(task.created), nowMs));
  const leadTimes = histories.flatMap((history) =>
    closingsOf(history)
      .filter((closing) => closing.at >= periodStart && closing.at <= nowMs)
      .map((closing) => daysBetween(history.createdAt, closing.at)),
  );
  const today = formatLocalDay(now);
  return {
    open: openTasks.length,
    createdToday: histories.filter((history) => formatLocalDay(new Date(history.createdAt)) === today).length,
    closedToday: histories.flatMap(closingsOf).filter((closing) => formatLocalDay(new Date(closing.at)) === today).length,
    openWeight: openTasks.reduce((sum, task) => sum + PRIORITY_WEIGHT[task.priority], 0),
    createdLastWeek: histories.filter((history) => inLastWeek(history.createdAt)).length,
    closedLastWeek: histories.flatMap(closingsOf).filter((closing) => inLastWeek(closing.at)).length,
    ageMedianDays: median(ages),
    olderThan30Days: ages.filter((age) => age >= STALE_DAYS).length,
    leadTimeMedianDays: median(leadTimes),
    leadTimeP90Days: nearestRank(leadTimes, TAIL_FRACTION),
    previous: previousTotals(histories, nowMs, journalStart),
  };
}

function previousTotals(histories: readonly TaskHistory[], nowMs: number, journalStart: number | null): PreviousTotals | null {
  const weekAgo = nowMs - LAST_WEEK_MS;
  if (journalStart === null || journalStart > weekAgo) return null;
  const inWeekBefore = (moment: number) => moment > weekAgo - LAST_WEEK_MS && moment <= weekAgo;
  const openThen = histories.filter((history) => isOpenAt(history, weekAgo));
  const closedThen = histories.flatMap(closingsOf).filter((closing) => inWeekBefore(closing.at));
  const leadTimes = histories.flatMap((history) => closingsOf(history).filter((closing) => inWeekBefore(closing.at)).map((closing) => daysBetween(history.createdAt, closing.at)));
  return {
    open: openThen.length,
    net: histories.filter((history) => inWeekBefore(history.createdAt)).length - closedThen.length,
    ageMedianDays: median(openThen.map((history) => daysBetween(history.createdAt, weekAgo))),
    leadTimeMedianDays: median(leadTimes),
  };
}
