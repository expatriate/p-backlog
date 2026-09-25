import { formatLocalDay } from "../model/dates";
import type { TaskHistory } from "./history";
import { consecutivePeriods, type Period } from "./period";
import type { FlowPeriod } from "./types";
import { flowOver } from "./weeks";

const STATS_DAYS = 30;

export function dayRange(now: Date, count: number): string[] {
  return dayStarts(now, count).map(formatLocalDay);
}

export function dailyFlow(histories: readonly TaskHistory[], now: Date): FlowPeriod[] {
  return flowOver(dayWindows(now), histories);
}

export function dayWindows(now: Date, count = STATS_DAYS): Period[] {
  return consecutivePeriods(dayStarts(now, count), now.getTime());
}

function dayStarts(now: Date, count: number): Date[] {
  return Array.from({ length: count }, (_, index) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - (count - 1 - index)));
}
