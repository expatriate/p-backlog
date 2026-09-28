import { UNKNOWN } from "../journal/events";
import { ageBreakdown, closingBreakdown, hotspots } from "./breakdowns";
import { scopeLabel } from "./format";
import { closingsIn, createdIn, isOpenAt, type TaskHistory } from "./history";
import { daysBetween, median, nearestRank, TAIL_FRACTION } from "./numbers";
import { sum } from "../numbers";
import { trailingPeriod, type Period } from "./period";
import { grainPeriods } from "./report-periods";
import { reportBase, type ReportBase, type StatsInput } from "./scope";
import { PRIORITY_WEIGHT } from "./weights";
import type { PreviousTotals, StatsReport, StatsTotals } from "./types";
import { dailyFlow, todaySoFar } from "./days";
import { WEEK_MS } from "../model/dates";
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
  const leadTimes = leadTimesIn(histories, period);
  const today = todaySoFar(now);
  return {
    open: ages.length,
    createdToday: createdIn(histories, today).length,
    closedToday: closingsIn(histories, today).length,
    openWeight: sum(openNow.map(priorityWeight)),
    createdLastWeek: createdIn(histories, lastWeek).length,
    closedLastWeek: closingsIn(histories, lastWeek).length,
    ageMedianDays: median(ages),
    olderThan30Days: ages.filter((age) => age >= STALE_DAYS).length,
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
  return {
    open: openThen.length,
    net: createdIn(histories, weekBefore).length - closingsIn(histories, weekBefore).length,
    ageMedianDays: median(openThen.map((history) => daysBetween(history.createdAt, weekAgo))),
    leadTimeMedianDays: median(leadTimesIn(histories, weekBefore)),
  };
}

function leadTimesIn(histories: readonly TaskHistory[], span: Period): number[] {
  return histories.flatMap((history) => closingsIn([history], span).map((closing) => daysBetween(history.createdAt, closing.at)));
}
