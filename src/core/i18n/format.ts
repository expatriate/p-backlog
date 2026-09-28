import { roundToTenth } from "../numbers";
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

const DAY_AND_SHORT_MONTH: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };

export function formatDay(language: Language, iso: string): string {
  return startOfLocalDay(iso).toLocaleDateString(localeOf(language), DAY_AND_SHORT_MONTH);
}

export function formatDayRange(language: Language, from: string, to: string): string {
  return new Intl.DateTimeFormat(localeOf(language), DAY_AND_SHORT_MONTH).formatRange(startOfLocalDay(from), startOfLocalDay(to));
}

export function startOfLocalDay(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00`);
}

export function formatDateTime(language: Language, iso: string): string {
  return new Date(iso).toLocaleString(localeOf(language), { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function formatDecimal(language: Language, value: number): string {
  return roundToTenth(value).toLocaleString(localeOf(language), { useGrouping: false });
}

export function formatMoney(language: Language, value: number | null): string {
  if (value === null) return "—";
  return `$${value.toLocaleString(localeOf(language), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
