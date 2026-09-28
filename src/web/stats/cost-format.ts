import { formatMoney } from "../../core/i18n/format";
import type { Language } from "../../core/i18n/language";
import { approx } from "./value-format";
import { NO_VALUE } from "../labels";

export function costValue(language: Language, cost: number | null): string {
  return cost === null ? NO_VALUE : approx(formatMoney(language, cost));
}
