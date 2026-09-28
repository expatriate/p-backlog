import { UNKNOWN } from "../journal/events";
import { ageBreakdown, closingBreakdown, hotspots } from "./breakdowns";
import { scopeLabel } from "./format";
import { closingsIn, closingsOfIn, createdIn, isOpenAt, type TaskHistory } from "./history";
import { median, nearestRank, sum } from "../numbers";
import { trailingPeriod, type Period } from "./period";
import { grainPeriods, lastDaysSpan } from "./report-periods";
import type { ReportContext } from "./scope";
import { PRIORITY_WEIGHT } from "./weights";
import type { PreviousTotals, StatsReport, StatsTotals } from "./types";
import { dailyFlow } from "./days";
import { daysBetween, WEEK_MS } from "../model/dates";
import { statsPeriod, weeklyFlow } from "./weeks";

const STALE_DAYS = 30;
const TAIL_FRACTION = 0.9;

export function statsReport(context: ReportContext): StatsReport {
  const { input: { now, projectId }, histories, openTasks } = context;
  const period = statsPeriod(now);

  return {
    ...context.head,
    periods: grainPeriods(now),
    totals: totals(histories, now, period, context.scope.journalStart),
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
  const today = lastDaysSpan(now, 1);
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
  return histories.flatMap((history) => closingsOfIn(history, span).map((closing) => daysBetween(history.createdAt, closing.at)));
}
