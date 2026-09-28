import { DAY_MS } from "../model/dates";

export const CHURN_DAYS = 90;

export function churnWindowStart(now: Date): Date {
  return new Date(now.getTime() - CHURN_DAYS * DAY_MS);
}
