import { formatMoney, formatWhole } from "../../core/i18n/format";
import type { CostNumbers } from "../../core/api/contract";
import type { Language } from "../../core/i18n/language";
import { NBSP } from "../../core/i18n/plural";
import { NO_VALUE } from "../labels";

const USD_CENT = 0.01;
const COST_ROUNDING_TOLERANCE_USD = 1e-10;

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
  if (cost === null) return NO_VALUE;
  if (cost > 0 && cost + COST_ROUNDING_TOLERANCE_USD < USD_CENT) return `<${NBSP}${formatMoney(language, USD_CENT)}`;
  return approx(formatMoney(language, cost));
}

export type PricedCost = { kind: "unpriced" } | { kind: "priced"; amount: string; withoutUnpricedModels: boolean };

export function pricedCost(language: Language, { cost, hasUnpricedTokens }: Pick<CostNumbers, "cost" | "hasUnpricedTokens">): PricedCost {
  return cost === null ? { kind: "unpriced" } : { kind: "priced", amount: costValue(language, cost), withoutUnpricedModels: hasUnpricedTokens };
}

export function pricedAmount(cost: PricedCost): string {
  return cost.kind === "priced" ? cost.amount : NO_VALUE;
}

export function unpricedNoteFor(cost: PricedCost, unpricedNote: string): string | undefined {
  return cost.kind === "priced" && cost.withoutUnpricedModels ? unpricedNote : undefined;
}

export function pricedCostText(cost: PricedCost, unpricedNote: string): string {
  const note = unpricedNoteFor(cost, unpricedNote);
  return note === undefined ? pricedAmount(cost) : `${pricedAmount(cost)} (${note})`;
}
