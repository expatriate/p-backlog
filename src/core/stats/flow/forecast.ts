import { formatLocalIso } from "../../model/dates";
import { DAY_MS } from "../../model/lifecycle";
import { closingsOf, type TaskHistory } from "../history";
import type { FlowForecast } from "../types";

export const FORECAST_WINDOW_WEEKS = 4;

const WINDOW_MS = FORECAST_WINDOW_WEEKS * 7 * DAY_MS;

export function inForecastWindow(now: Date): (moment: number) => boolean {
  const nowMs = now.getTime();
  return (moment) => moment > nowMs - WINDOW_MS && moment <= nowMs;
}

export function flowForecast(histories: readonly TaskHistory[], open: number, now: Date): FlowForecast {
  const inWindow = inForecastWindow(now);
  const closed = histories.flatMap(closingsOf).filter((closing) => inWindow(closing.at)).length;
  const created = histories.filter((history) => inWindow(history.createdAt)).length;
  const weeklyNet = (closed - created) / FORECAST_WINDOW_WEEKS;
  const weeks = open > 0 && weeklyNet > 0 ? Math.ceil(open / weeklyNet) : null;
  return { closed, created, open, weeklyNet, weeks, until: weeks === null ? null : formatLocalIso(weeksLater(now, weeks)) };
}

function weeksLater(now: Date, weeks: number): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7 * weeks, now.getHours(), now.getMinutes(), now.getSeconds());
}
