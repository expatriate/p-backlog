import { formatLocalIso } from "../model/dates";
import { DAYS_PER_WEEK, STATS_WEEKS, WEEK_MS } from "../model/lifecycle";
import { closingsOf, isOpenAt, type TaskHistory } from "./history";
import { consecutivePeriods, period, type Period } from "./period";
import type { FlowPeriod } from "./types";

export { DAYS_PER_WEEK, STATS_WEEKS, WEEK_MS };

const MONDAY = 1;

function weekStarts(now: Date, count: number): Date[] {
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + DAYS_PER_WEEK - MONDAY) % DAYS_PER_WEEK));
  return Array.from({ length: count }, (_, index) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - DAYS_PER_WEEK * (count - 1 - index)));
}

export function statsPeriod(now: Date): Period {
  return period(weekStarts(now, STATS_WEEKS)[0]?.getTime() ?? now.getTime(), now.getTime());
}

export function weekWindows(now: Date, count = STATS_WEEKS): Period[] {
  return consecutivePeriods(weekStarts(now, count), now.getTime());
}

export function flowOver(periods: readonly Period[], histories: readonly TaskHistory[]): FlowPeriod[] {
  const closings = histories.flatMap(closingsOf);
  return periods.map((span) => ({
    start: formatLocalIso(new Date(span.from)),
    created: histories.filter((history) => span.contains(history.createdAt)).length,
    closed: closings.filter((closing) => span.contains(closing.at)).length,
    openAtEnd: histories.filter((history) => isOpenAt(history, span.to)).length,
  }));
}

export function weeklyFlow(histories: readonly TaskHistory[], now: Date): FlowPeriod[] {
  return flowOver(weekWindows(now), histories);
}
