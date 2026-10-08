import { formatNumber } from "./format";
import { localeOf } from "./language";

const RU_PLURAL_RULES = new Intl.PluralRules(localeOf("ru"));

export function pluralRu(n: number, one: string, few: string, many: string): string {
  if (!Number.isInteger(n)) return few;
  switch (RU_PLURAL_RULES.select(n)) {
    case "one":
      return one;
    case "many":
      return many;
    default:
      return few;
  }
}

export function pluralEn(n: number, one: string, other: string): string {
  return n === 1 ? one : other;
}

export const NBSP = " ";

export function countRu(n: number, one: string, few: string, many: string): string {
  return `${formatNumber("ru", n)}${NBSP}${pluralRu(n, one, few, many)}`;
}

export function countEn(n: number, one: string, other: string): string {
  return `${formatNumber("en", n)}${NBSP}${pluralEn(n, one, other)}`;
}
