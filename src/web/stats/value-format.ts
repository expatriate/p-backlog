import { formatMoney, formatWhole } from "../../core/i18n/format";
import type { CostNumbers } from "../../core/api/contract";
import type { Language } from "../../core/i18n/language";
import { NBSP } from "../../core/i18n/plural";
import { NO_VALUE } from "../labels";

export function approx(text: string): string {
  return `≈${NBSP}${text}`;
}

export function exactly(text: string): string {
  return `=${NBSP}${text}`;
}

export function wholeFormatter(language: Language): (value: number) => string {
  return (value) => formatWhole(language, value);
}

export function costValue(language: Language, cost: number | null): string {
  return cost === null ? NO_VALUE : approx(formatMoney(language, cost));
}

export function costText(language: Language, { cost, hasUnpricedTokens }: Pick<CostNumbers, "cost" | "hasUnpricedTokens">, unpricedNote: string): string {
  const value = costValue(language, cost);
  return hasUnpricedTokens && cost !== null ? `${value} (${unpricedNote})` : value;
}
