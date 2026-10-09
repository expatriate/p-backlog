import { formatMoney, formatNumber } from "../../core/i18n/format";
import type { Language } from "../../core/i18n/language";
import { NBSP } from "../../core/i18n/plural";
import { NO_VALUE } from "../labels";

export function approx(text: string): string {
  return `≈${NBSP}${text}`;
}

export function formatWhole(language: Language, value: number): string {
  return formatNumber(language, Math.round(value));
}

export function wholeFormatter(language: Language): (value: number) => string {
  return (value) => formatWhole(language, value);
}

export function costValue(language: Language, cost: number | null): string {
  return cost === null ? NO_VALUE : approx(formatMoney(language, cost));
}
