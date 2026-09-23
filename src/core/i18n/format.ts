import { localeOf, type Language } from "./language";

export function formatNumber(language: Language, n: number): string {
  return n.toLocaleString(localeOf(language));
}

export function formatDayMonth(language: Language, date: Date): string {
  return date.toLocaleDateString(localeOf(language), { day: "2-digit", month: "2-digit" });
}

export function formatDate(language: Language, iso: string): string {
  return new Date(iso).toLocaleDateString(localeOf(language), { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export function formatDateTime(language: Language, iso: string): string {
  return new Date(iso).toLocaleString(localeOf(language), { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
