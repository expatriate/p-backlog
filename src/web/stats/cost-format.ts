import { formatMoney } from "../../core/i18n/format";
import type { Language } from "../../core/i18n/language";
import { NBSP } from "../../core/i18n/plural";

export function costValue(language: Language, cost: number | null): string {
  return cost === null ? "—" : `≈${NBSP}${formatMoney(language, cost)}`;
}
