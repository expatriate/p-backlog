import { formatLocalDay } from "../model/dates";
import type { TaskHistory } from "./history";
import { consecutivePeriods, type Period } from "./period";
import type { DayFlow } from "./types";

const STATS_DAYS = 30;

export function dayRange(now: Date, count: number): string[] {
  return dayStarts(now, count).map(formatLocalDay);
}

export function dailyIntake(histories: readonly TaskHistory[], now: Date): DayFlow[] {
  const created = new Map<string, number>();
  for (const history of histories) {
    const day = formatLocalDay(new Date(history.createdAt));
    created.set(day, (created.get(day) ?? 0) + 1);
  }
  return dayRange(now, STATS_DAYS).map((day) => ({ day, created: created.get(day) ?? 0 }));
}

export function dayWindows(now: Date, count = STATS_DAYS): Period[] {
  return consecutivePeriods(dayStarts(now, count), now.getTime());
}

function dayStarts(now: Date, count: number): Date[] {
  return Array.from({ length: count }, (_, index) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - (count - 1 - index)));
}
