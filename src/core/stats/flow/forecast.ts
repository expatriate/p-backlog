import { formatLocalIso } from "../../model/dates";
import { closingsOf, type TaskHistory } from "../history";
import type { FlowForecast } from "../types";
import { DAYS_PER_WEEK, WEEK_MS } from "../weeks";

const FORECAST_WINDOW_WEEKS = 4;

const WINDOW_MS = FORECAST_WINDOW_WEEKS * WEEK_MS;

function inForecastWindow(now: Date): (moment: number) => boolean {
  const nowMs = now.getTime();
  return (moment) => moment > nowMs - WINDOW_MS && moment <= nowMs;
}

export function flowForecast(histories: readonly TaskHistory[], open: number, now: Date): FlowForecast {
  const inWindow = inForecastWindow(now);
  const closed = histories.flatMap(closingsOf).filter((closing) => inWindow(closing.at)).length;
  const created = histories.filter((history) => inWindow(history.createdAt)).length;
  const weeklyNet = (closed - created) / FORECAST_WINDOW_WEEKS;
  const weeks = open > 0 && weeklyNet > 0 ? Math.ceil(open / weeklyNet) : null;
  return { closed, created, open, weeklyNet, weeks, until: weeks === null ? null : formatLocalIso(weeksLater(now, weeks)), windowWeeks: FORECAST_WINDOW_WEEKS };
}

function weeksLater(now: Date, weeks: number): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + DAYS_PER_WEEK * weeks, now.getHours(), now.getMinutes(), now.getSeconds());
}
