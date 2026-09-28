import { formatMoney } from "../../core/i18n/format";
import type { Language } from "../../core/i18n/language";
import { approx, NO_VALUE } from "./value-format";

export function costValue(language: Language, cost: number | null): string {
  return cost === null ? NO_VALUE : approx(formatMoney(language, cost));
}
