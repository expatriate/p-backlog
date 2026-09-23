export const NBSP = " ";

export function projectLabel(projectId: string, label: string, withProject: boolean): string {
  return withProject ? `${projectId} · ${label}` : label;
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
  return String(roundToTenth(value)).replace(".", ",");
}

export function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

export function formatMoney(value: number | null): string {
  if (value === null) return "—";
  return `$${value.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDayMonth(date: Date): string {
  return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}
