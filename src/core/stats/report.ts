import type { Task } from "../model/types";
import { ageBreakdown, closingBreakdown, hotspots } from "./breakdowns";
import { scopeLabel } from "./format";
import { closingsOf, isOpenAt, type TaskHistory } from "./history";
import { daysBetween, median, nearestRank, sum, TAIL_FRACTION } from "./numbers";
import type { Period } from "./period";
import { reportBase, type ReportBase, type StatsInput } from "./scope";
import { PRIORITY_WEIGHT } from "./weights";
import type { PreviousTotals, StatsReport, StatsTotals } from "./types";
import { dailyIntake } from "./days";
import { formatLocalDay } from "../model/dates";
import { statsPeriod, WEEK_MS, weeklyFlow } from "./weeks";

const STALE_DAYS = 30;

export function statsReport(input: StatsInput, base: ReportBase = reportBase(input)): StatsReport {
  const { now, projectId } = input;
  const { histories, openTasks } = base;
  const period = statsPeriod(now);

  return {
    ...base.head,
    totals: totals(openTasks, histories, now, period, base.scope.journalStart),
    weeks: weeklyFlow(histories, now),
    days: dailyIntake(histories, now),
    hotspots: hotspots(openTasks, scopeLabel(projectId)),
    age: ageBreakdown(openTasks, now),
    closing: closingBreakdown(histories, period),
  };
}

function totals(openTasks: readonly Task[], histories: readonly TaskHistory[], now: Date, period: Period, journalStart: number | null): StatsTotals {
  const nowMs = now.getTime();
  const inLastWeek = (moment: number) => moment > nowMs - WEEK_MS && moment <= nowMs;
  const ages = openTasks.map((task) => daysBetween(Date.parse(task.created), nowMs));
  const leadTimes = histories.flatMap((history) =>
    closingsOf(history)
      .filter((closing) => period.contains(closing.at))
      .map((closing) => daysBetween(history.createdAt, closing.at)),
  );
  const today = formatLocalDay(now);
  return {
    open: openTasks.length,
    createdToday: histories.filter((history) => formatLocalDay(new Date(history.createdAt)) === today).length,
    closedToday: histories.flatMap(closingsOf).filter((closing) => formatLocalDay(new Date(closing.at)) === today).length,
    openWeight: sum(openTasks.map((task) => PRIORITY_WEIGHT[task.priority])),
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
  const weekAgo = nowMs - WEEK_MS;
  if (journalStart === null || journalStart > weekAgo) return null;
  const inWeekBefore = (moment: number) => moment > weekAgo - WEEK_MS && moment <= weekAgo;
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
