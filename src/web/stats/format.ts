import { formatDays, NBSP } from "../../core/stats/format";

export function formatStay(days: number, atLeast: boolean): string {
  return atLeast && days >= 1 ? `не меньше ${formatDays(days)}` : formatDays(days);
}

export function epicEta(weeks: number | null): string {
  if (weeks === null) return "темпа нет";
  if (weeks === 0) return "готов";
  return `≈${NBSP}${weeks}${NBSP}нед.`;
}
