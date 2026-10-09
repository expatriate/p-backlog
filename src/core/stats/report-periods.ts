import { formatLocalIso } from "../model/dates";
import { dayWindows, STATS_DAYS } from "./days";
import { period, type Period } from "./period";
import type { GrainPeriods, ReportPeriod } from "./types";
import { statsPeriod } from "./weeks";

function reportPeriod({ from, to }: Period): ReportPeriod {
  return { from: formatLocalIso(new Date(from)), to: formatLocalIso(new Date(to)) };
}

export function lastDays(now: Date, count: number): ReportPeriod {
  return reportPeriod(lastDaysPeriod(now, count));
}

export function lastDaysPeriod(now: Date, count: number): Period {
  return period(dayWindows(now, count)[0]?.from ?? now.getTime(), now.getTime());
}

export function grainPeriods(now: Date): GrainPeriods {
  return { weeks: reportPeriod(statsPeriod(now)), days: lastDays(now, STATS_DAYS) };
}
