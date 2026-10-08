export const SECOND_MS = 1000;

export const HOUR_MS = 60 * 60 * SECOND_MS;

export const DAY_MS = 24 * HOUR_MS;

export const DAYS_PER_WEEK = 7;

export const DAYS_PER_MONTH = 30;

export const WEEK_MS = DAYS_PER_WEEK * DAY_MS;

export function daysBetween(from: number, to: number): number {
  return (to - from) / DAY_MS;
}

const ISO_DATE_LENGTH = "YYYY-MM-DD".length;

export function isoDatePart(iso: string): string {
  return iso.slice(0, ISO_DATE_LENGTH);
}

export function formatLocalDay(date: Date): string {
  return isoDatePart(formatLocalIso(date));
}

export function formatLocalIso(date: Date): string {
  const pad = (value: number) => String(Math.abs(value)).padStart(2, "0");
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const offset = `${sign}${pad(Math.trunc(offsetMinutes / 60))}:${pad(offsetMinutes % 60)}`;
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  return `${day}T${time}${offset}`;
}
