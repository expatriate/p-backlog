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
