import type { CandidateEvidence } from "../journal/events";
import type { FlowForecast } from "./types";

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

export function formatDecimal(value: number): string {
  return String(Math.round(value * 10) / 10).replace(".", ",");
}

export function formatDayMonth(date: Date): string {
  return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

export function forecastText({ open, weeklyNet, weeks, until }: FlowForecast): string {
  if (open === 0) return "Открытых задач нет";
  if (weeks !== null && until !== null) return `Долг разберётся примерно за ${weeks} нед. (к ${formatDayMonth(new Date(until))})`;
  if (weeklyNet === 0) return "Долг не уменьшается";
  return `Долг растёт на ${formatDecimal(-weeklyNet)} задач в неделю`;
}

export const EVIDENCE_LABELS: Record<CandidateEvidence | "total", string> = {
  "source-changed": "код изменился",
  "source-missing": "файл пропал",
  duplicate: "дубль",
  "no-source": "нет source",
  total: "Всего",
};
