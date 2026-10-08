import { DAYS_PER_MONTH } from "../model/dates";
import { flowOver } from "./flow/flow-over";
import type { TaskHistory } from "./history";
import { consecutivePeriods, type Period } from "./period";
import type { FlowPeriod } from "./types";

export const STATS_DAYS = DAYS_PER_MONTH;

export function dailyFlow(histories: readonly TaskHistory[], now: Date): FlowPeriod[] {
  return flowOver(dayWindows(now), histories);
}

export function dayWindows(now: Date, count = STATS_DAYS): Period[] {
  return consecutivePeriods(dayStarts(now, count), now.getTime());
}

function dayStarts(now: Date, count: number): Date[] {
  return Array.from({ length: count }, (_, index) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - (count - 1 - index)));
}
