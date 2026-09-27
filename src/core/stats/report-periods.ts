import { formatLocalIso } from "../model/dates";
import { dayWindows } from "./days";
import { period, type Period } from "./period";
import type { GrainPeriods, ReportPeriod } from "./types";
import { statsPeriod } from "./weeks";

export function reportPeriod(span: Period): ReportPeriod {
  return { from: formatLocalIso(new Date(span.from)), to: formatLocalIso(new Date(span.to)) };
}

export function lastDays(now: Date, count: number): ReportPeriod {
  return spanOfWindows(dayWindows(now, count), now);
}

export function grainPeriods(now: Date): GrainPeriods {
  return { weeks: reportPeriod(statsPeriod(now)), days: spanOfWindows(dayWindows(now), now) };
}

function spanOfWindows(windows: readonly Period[], now: Date): ReportPeriod {
  return reportPeriod(period(windows[0]?.from ?? now.getTime(), now.getTime()));
}
