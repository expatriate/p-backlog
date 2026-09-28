import { roundToTenth } from "../numbers";
import type { FlowForecast } from "../stats/types";
import { DAYS_PER_WEEK } from "../model/dates";

export type ForecastOutlook = { kind: "no-open" } | { kind: "clears"; weeks: number; until: Date } | { kind: "not-shrinking" } | { kind: "grows"; perWeek: number };

export type SpanUnit = "week" | "day";

export function forecastOutlook({ open, weeklyNet, weeks, until }: FlowForecast): ForecastOutlook {
  if (open === 0) return { kind: "no-open" };
  if (weeks !== null && until !== null) return { kind: "clears", weeks, until: new Date(until) };
  if (weeklyNet === 0) return { kind: "not-shrinking" };
  return { kind: "grows", perWeek: roundToTenth(-weeklyNet) };
}

export function forecastSpan(windowDays: number): { unit: SpanUnit; count: number } {
  return windowDays % DAYS_PER_WEEK === 0 ? { unit: "week", count: windowDays / DAYS_PER_WEEK } : { unit: "day", count: windowDays };
}
