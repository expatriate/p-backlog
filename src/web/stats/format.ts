import type { FlowForecast } from "../../core/stats/types";
import { formatDayMonth } from "../labels";

export function formatDays(days: number | null): string {
  if (days === null) return "—";
  if (days < 1) return "меньше дня";
  return `${Math.round(days)} дн.`;
}

export function formatShare(share: number | null): string {
  return share === null ? "—" : `${Math.round(share * 100)}%`;
}

export function formatSigned(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

export function forecastText({ open, weeklyNet, weeks, until }: FlowForecast): string {
  if (open === 0) return "Открытых задач нет";
  if (weeks !== null && until !== null) return `Долг разберётся примерно за ${weeks} нед. (к ${formatDayMonth(new Date(until))})`;
  if (weeklyNet === 0) return "Долг не уменьшается";
  return `Долг растёт на ${formatRate(-weeklyNet)} задач в неделю`;
}

export function formatRate(value: number): string {
  return String(Math.round(value * 10) / 10).replace(".", ",");
}

export function formatStay(days: number, atLeast: boolean): string {
  return atLeast && days >= 1 ? `не меньше ${formatDays(days)}` : formatDays(days);
}

export function epicEta(weeks: number | null): string {
  if (weeks === null) return "темпа нет";
  if (weeks === 0) return "готов";
  return `≈ ${weeks} нед.`;
}
