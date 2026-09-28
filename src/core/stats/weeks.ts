import { DAYS_PER_WEEK } from "../model/dates";
import { flowOver } from "./flow/flow-over";
import type { TaskHistory } from "./history";
import { consecutivePeriods, period, type Period } from "./period";
import type { FlowPeriod } from "./types";
import { STATS_WEEKS } from "./window";

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

export function weeklyFlow(histories: readonly TaskHistory[], now: Date): FlowPeriod[] {
  return flowOver(weekWindows(now), histories);
}
