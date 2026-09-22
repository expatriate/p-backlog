import { formatLocalDay } from "../model/dates";
import type { TaskHistory } from "./history";
import type { DayFlow } from "./types";

export const STATS_DAYS = 30;

export function dayRange(now: Date, count: number): string[] {
  return Array.from({ length: count }, (_, index) => formatLocalDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (count - 1 - index))));
}

export function dailyIntake(histories: readonly TaskHistory[], now: Date): DayFlow[] {
  const created = new Map<string, number>();
  for (const history of histories) {
    const day = formatLocalDay(new Date(history.createdAt));
    created.set(day, (created.get(day) ?? 0) + 1);
  }
  return dayRange(now, STATS_DAYS).map((day) => ({ day, created: created.get(day) ?? 0 }));
}

export function dayWindows(now: Date, count = STATS_DAYS): { start: Date; inWindow: (moment: number) => boolean }[] {
  return Array.from({ length: count }, (_, index) => {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (count - 1 - index));
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1).getTime();
    return { start, inWindow: (moment: number) => moment >= start.getTime() && moment < end };
  });
}
