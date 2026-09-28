import { formatNumber } from "../../core/i18n/format";
import type { Language } from "../../core/i18n/language";
import { NBSP } from "../../core/i18n/plural";

export const NO_VALUE = "—";

export function approx(text: string): string {
  return `≈${NBSP}${text}`;
}

export function formatWhole(language: Language, value: number): string {
  return formatNumber(language, Math.round(value));
}
