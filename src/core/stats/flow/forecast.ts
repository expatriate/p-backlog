import { DAYS_PER_WEEK, formatLocalIso, WEEK_MS } from "../../model/dates";
import { createdIn, lastingClosingsIn } from "../history";
import { trailingSpan } from "../period";
import type { ReportContext } from "../scope";
import type { FlowForecast } from "../types";

const FORECAST_WINDOW_WEEKS = 4;
const MIN_WINDOW_WEEKS = 1;

function backlogAgeWeeks(backlogSince: string | null, now: Date): number | null {
  return backlogSince === null ? null : (now.getTime() - Date.parse(backlogSince)) / WEEK_MS;
}

const clampedWeeks = (weeks: number) => Math.min(FORECAST_WINDOW_WEEKS, Math.max(MIN_WINDOW_WEEKS, weeks));

export function flowForecast({ histories, head, input: { now } }: ReportContext, open: number): FlowForecast {
  const ageWeeks = backlogAgeWeeks(head.backlogSince, now);
  const windowWeeks = ageWeeks === null ? FORECAST_WINDOW_WEEKS : clampedWeeks(Math.floor(ageWeeks) + 1);
  const observedWeeks = ageWeeks === null ? FORECAST_WINDOW_WEEKS : clampedWeeks(ageWeeks);
  const window = trailingSpan(now.getTime(), windowWeeks * WEEK_MS);
  const closed = lastingClosingsIn(histories, window).length;
  const created = createdIn(histories, window).length;
  const weeklyNet = (closed - created) / observedWeeks;
  const weeks = open > 0 && weeklyNet > 0 ? Math.ceil(open / weeklyNet) : null;
  const windowDays = Math.round(observedWeeks * DAYS_PER_WEEK);
  return { closed, created, open, weeklyNet, weeks, until: weeks === null ? null : formatLocalIso(weeksLater(now, weeks)), windowDays };
}

function weeksLater(now: Date, weeks: number): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + DAYS_PER_WEEK * weeks, now.getHours(), now.getMinutes(), now.getSeconds());
}
