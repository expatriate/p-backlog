import { formatMoney } from "../../core/i18n/format";
import type { Language } from "../../core/i18n/language";
import { NBSP } from "../../core/stats/format";

export function costValue(language: Language, cost: number | null): string {
  return cost === null ? "—" : `≈${NBSP}${formatMoney(language, cost)}`;
}
