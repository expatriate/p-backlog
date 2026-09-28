import { UNKNOWN } from "../journal/events";
import { ageBreakdown, closingBreakdown, hotspots } from "./breakdowns";
import { scopeLabel } from "./format";
import { closingsOf, isOpenAt, type TaskHistory } from "./history";
import { daysBetween, median, nearestRank, sum, TAIL_FRACTION } from "./numbers";
import { trailingPeriod, type Period } from "./period";
import { grainPeriods } from "./report-periods";
import { reportBase, type ReportBase, type StatsInput } from "./scope";
import { PRIORITY_WEIGHT } from "./weights";
import type { PreviousTotals, StatsReport, StatsTotals } from "./types";
import { dailyFlow } from "./days";
import { formatLocalDay, WEEK_MS } from "../model/dates";
import { statsPeriod, weeklyFlow } from "./weeks";

const STALE_DAYS = 30;

export function statsReport(input: StatsInput, base: ReportBase = reportBase(input)): StatsReport {
  const { now, projectId } = input;
  const { histories, openTasks } = base;
  const period = statsPeriod(now);

  return {
    ...base.head,
    periods: grainPeriods(now),
    totals: totals(histories, now, period, base.scope.journalStart),
    weeks: weeklyFlow(histories, now),
    days: dailyFlow(histories, now),
    hotspots: hotspots(openTasks, scopeLabel(projectId)),
    age: ageBreakdown(openTasks, now),
    closing: closingBreakdown(histories, period),
  };
}

function totals(histories: readonly TaskHistory[], now: Date, period: Period, journalStart: number | null): StatsTotals {
  const nowMs = now.getTime();
  const lastWeek = trailingPeriod(nowMs, WEEK_MS);
  const openNow = histories.filter((history) => isOpenAt(history, nowMs));
  const ages = openNow.map((history) => daysBetween(history.createdAt, nowMs));
  const leadTimes = histories.flatMap((history) =>
    closingsOf(history)
      .filter((closing) => period.contains(closing.at))
      .map((closing) => daysBetween(history.createdAt, closing.at)),
  );
  const today = formatLocalDay(now);
  return {
    open: ages.length,
    createdToday: histories.filter((history) => formatLocalDay(new Date(history.createdAt)) === today).length,
    closedToday: histories.flatMap(closingsOf).filter((closing) => formatLocalDay(new Date(closing.at)) === today).length,
    openWeight: sum(openNow.map(priorityWeight)),
    createdLastWeek: histories.filter((history) => lastWeek.contains(history.createdAt)).length,
    closedLastWeek: histories.flatMap(closingsOf).filter((closing) => lastWeek.contains(closing.at)).length,
    ageMedianDays: median(ages),
    staleOpen: ages.filter((age) => age >= STALE_DAYS).length,
    leadTimeMedianDays: median(leadTimes),
    leadTimeP90Days: nearestRank(leadTimes, TAIL_FRACTION),
    previous: previousTotals(histories, nowMs, journalStart),
  };
}

function priorityWeight({ priority }: TaskHistory): number {
  return priority === undefined || priority === UNKNOWN ? 0 : PRIORITY_WEIGHT[priority];
}

function previousTotals(histories: readonly TaskHistory[], nowMs: number, journalStart: number | null): PreviousTotals | null {
  const weekAgo = nowMs - WEEK_MS;
  if (journalStart === null || journalStart > weekAgo) return null;
  const weekBefore = trailingPeriod(weekAgo, WEEK_MS);
  const openThen = histories.filter((history) => isOpenAt(history, weekAgo));
  const closedThen = histories.flatMap(closingsOf).filter((closing) => weekBefore.contains(closing.at));
  const leadTimes = histories.flatMap((history) => closingsOf(history).filter((closing) => weekBefore.contains(closing.at)).map((closing) => daysBetween(history.createdAt, closing.at)));
  return {
    open: openThen.length,
    net: histories.filter((history) => weekBefore.contains(history.createdAt)).length - closedThen.length,
    ageMedianDays: median(openThen.map((history) => daysBetween(history.createdAt, weekAgo))),
    leadTimeMedianDays: median(leadTimes),
  };
}
