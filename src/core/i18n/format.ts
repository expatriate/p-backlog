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

export function formatDayRange(language: Language, from: string, to: string): string {
  return new Intl.DateTimeFormat(localeOf(language), { day: "numeric", month: "short" }).formatRange(localDay(from), localDay(to));
}

export function localDay(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00`);
}

export function formatDateTime(language: Language, iso: string): string {
  return new Date(iso).toLocaleString(localeOf(language), { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function formatDecimal(language: Language, value: number): string {
  const rounded = String(roundToTenth(value));
  return language === "ru" ? rounded.replace(".", ",") : rounded;
}

export function formatMoney(language: Language, value: number | null): string {
  if (value === null) return "—";
  return `$${value.toLocaleString(localeOf(language), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
