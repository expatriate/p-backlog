export const DAY_MS = 24 * 60 * 60 * 1000;

export const DAYS_PER_WEEK = 7;

export const WEEK_MS = DAYS_PER_WEEK * DAY_MS;

export function formatLocalDay(date: Date): string {
  return formatLocalIso(date).slice(0, 10);
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
