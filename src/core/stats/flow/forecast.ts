import { formatLocalIso } from "../../model/dates";
import { closingsOf, type TaskHistory } from "../history";
import { smallest } from "../numbers";
import type { FlowForecast } from "../types";
import { DAYS_PER_WEEK, WEEK_MS } from "../weeks";

const FORECAST_WINDOW_WEEKS = 4;
const MIN_WINDOW_WEEKS = 1;

function windowWeeksOf(histories: readonly TaskHistory[], now: Date): number {
  const firstCreated = smallest(histories.map((history) => history.createdAt));
  const ageWeeks = firstCreated === null ? FORECAST_WINDOW_WEEKS : Math.floor((now.getTime() - firstCreated) / WEEK_MS) + 1;
  return Math.min(FORECAST_WINDOW_WEEKS, Math.max(MIN_WINDOW_WEEKS, ageWeeks));
}

export function flowForecast(histories: readonly TaskHistory[], open: number, now: Date): FlowForecast {
  const windowWeeks = windowWeeksOf(histories, now);
  const nowMs = now.getTime();
  const inWindow = (moment: number) => moment > nowMs - windowWeeks * WEEK_MS && moment <= nowMs;
  const closed = histories.flatMap(closingsOf).filter((closing) => inWindow(closing.at)).length;
  const created = histories.filter((history) => inWindow(history.createdAt)).length;
  const weeklyNet = (closed - created) / windowWeeks;
  const weeks = open > 0 && weeklyNet > 0 ? Math.ceil(open / weeklyNet) : null;
  return { closed, created, open, weeklyNet, weeks, until: weeks === null ? null : formatLocalIso(weeksLater(now, weeks)), windowWeeks };
}

function weeksLater(now: Date, weeks: number): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + DAYS_PER_WEEK * weeks, now.getHours(), now.getMinutes(), now.getSeconds());
}
