import { formatLocalDay } from "../model/dates";
import type { TaskHistory } from "./history";
import type { DayFlow } from "./types";

export const INTAKE_DAYS = 30;

export function dayRange(now: Date, count: number): string[] {
  return Array.from({ length: count }, (_, index) => formatLocalDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (count - 1 - index))));
}

export function dailyIntake(histories: readonly TaskHistory[], now: Date): DayFlow[] {
  const created = new Map<string, number>();
  for (const history of histories) {
    const day = formatLocalDay(new Date(history.createdAt));
    created.set(day, (created.get(day) ?? 0) + 1);
  }
  return dayRange(now, INTAKE_DAYS).map((day) => ({ day, created: created.get(day) ?? 0 }));
}
