import type { CandidateEvidence } from "../journal/events";
import type { FlowForecast } from "./types";

export const NBSP = " ";

export function plural(count: number, one: string, few: string, many: string): string {
  if (!Number.isInteger(count)) return many;
  const n = Math.abs(count);
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return many;
  const last = n % 10;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

export function pluralCount(count: number, one: string, few: string, many: string): string {
  return `${count}${NBSP}${plural(count, one, few, many)}`;
}

export function formatDays(days: number | null): string {
  if (days === null) return "—";
  if (days < 1) return "меньше дня";
  return `${Math.round(days)}${NBSP}дн.`;
}

export function formatP90(days: number | null): string {
  if (days === null) return "—";
  return days < 1 ? "быстрее суток" : `за ${formatDays(days)}`;
}

export function formatShare(share: number | null): string {
  return share === null ? "—" : `${Math.round(share * 100)}%`;
}

export function formatSigned(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

export function formatDecimal(value: number): string {
  return String(Math.round(value * 10) / 10).replace(".", ",");
}

export function formatDayMonth(date: Date): string {
  return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

export function forecastText({ open, weeklyNet, weeks, until }: FlowForecast): string {
  if (open === 0) return "Открытых задач нет";
  if (weeks !== null && until !== null) return `Долг разберётся примерно за ${weeks}${NBSP}нед. (к ${formatDayMonth(new Date(until))})`;
  if (weeklyNet === 0) return "Долг не уменьшается";
  const growth = -weeklyNet;
  return `Долг растёт на ${formatDecimal(growth)}${NBSP}${plural(growth, "задача", "задачи", "задач")} в неделю`;
}

export function forecastTail({ windowWeeks, closed, created }: FlowForecast): string {
  return `за ${pluralCount(windowWeeks, "неделю", "недели", "недель")}: закрыто ${closed}, создано ${created}`;
}

export const EVIDENCE_LABELS: Record<CandidateEvidence | "total", string> = {
  "source-changed": "код изменился",
  "source-missing": "файл пропал",
  duplicate: "дубль",
  "no-source": "нет source",
  total: "Всего",
};
