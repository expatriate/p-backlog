import { formatLocalIso } from "../model/dates";
import { DAY_MS } from "../model/lifecycle";
import { closingsOf, isOpenAt, type TaskHistory } from "./history";
import { consecutivePeriods, period, type Period } from "./period";
import type { WeekFlow } from "./types";

export const STATS_WEEKS = 12;
export const DAYS_PER_WEEK = 7;
export const WEEK_MS = DAYS_PER_WEEK * DAY_MS;

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

export function weeklyFlow(histories: readonly TaskHistory[], now: Date): WeekFlow[] {
  const closings = histories.flatMap(closingsOf);
  return weekWindows(now).map((week) => ({
    start: formatLocalIso(new Date(week.from)),
    created: histories.filter((history) => week.contains(history.createdAt)).length,
    closed: closings.filter((closing) => week.contains(closing.at)).length,
    openAtEnd: histories.filter((history) => isOpenAt(history, week.to)).length,
  }));
}
