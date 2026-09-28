import { DAY_MS, DAYS_PER_WEEK } from "../model/dates";

export const STATS_WEEKS = 12;

const STATS_HISTORY_DAYS = STATS_WEEKS * DAYS_PER_WEEK;

const HISTORY_SLACK_DAYS = 7;

const RETAINED_HISTORY_DAYS = STATS_HISTORY_DAYS + HISTORY_SLACK_DAYS;

export function retainedSince(now: Date): number {
  return now.getTime() - RETAINED_HISTORY_DAYS * DAY_MS;
}
