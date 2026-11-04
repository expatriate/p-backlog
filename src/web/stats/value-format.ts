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

export type PricedCost = { value: string; withoutUnpricedModels: boolean };

export function pricedCost(language: Language, { cost, hasUnpricedTokens }: Pick<CostNumbers, "cost" | "hasUnpricedTokens">): PricedCost {
  return { value: costValue(language, cost), withoutUnpricedModels: hasUnpricedTokens && cost !== null };
}
