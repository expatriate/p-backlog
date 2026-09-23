import { formatDayMonth } from "../../../core/i18n/format";
import { localeOf, type Language } from "../../../core/i18n/language";

const COMPACT_OPTIONS: Intl.NumberFormatOptions = { notation: "compact", maximumFractionDigits: 1 };
const COMPACT: Record<Language, Intl.NumberFormat> = {
  ru: new Intl.NumberFormat(localeOf("ru"), COMPACT_OPTIONS),
  en: new Intl.NumberFormat(localeOf("en"), COMPACT_OPTIONS),
};

function localDay(day: string): Date {
  return new Date(`${day.slice(0, 10)}T00:00:00`);
}

export function axisDay(language: Language, day: string): string {
  return formatDayMonth(language, localDay(day));
}

export function tooltipDay(language: Language, day: string): string {
  return localDay(day).toLocaleDateString(localeOf(language), { day: "numeric", month: "short" });
}

export function axisTime(language: Language, at: string): string {
  return new Date(at).toLocaleTimeString(localeOf(language), { hour: "2-digit", minute: "2-digit" });
}

export function tooltipTime(language: Language, at: string): string {
  return new Date(at).toLocaleTimeString(localeOf(language), { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function compactNumber(language: Language, value: number): string {
  return COMPACT[language].format(value);
}
