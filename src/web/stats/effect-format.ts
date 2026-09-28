import type { Language } from "../../core/i18n/language";
import { formatShare } from "../../core/stats/format";
import { approx, formatWhole } from "./value-format";
import { NO_VALUE } from "../labels";

export function isEstimated(estimatedLines: number | null): boolean {
  return typeof estimatedLines === "number" && estimatedLines > 0;
}

export function formatApprox(language: Language, value: number, isApprox: boolean): string {
  return isApprox ? approx(formatWhole(language, value)) : formatWhole(language, value);
}

export function formatNoiseShare(noiseShare: number | null): string {
  return noiseShare === null ? NO_VALUE : approx(formatShare(noiseShare));
}
