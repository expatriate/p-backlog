import { formatNumber } from "../../core/i18n/format";
import type { Language } from "../../core/i18n/language";
import { formatShare, NBSP } from "../../core/stats/format";

export function isEstimated(estimatedLines: number | null): boolean {
  return typeof estimatedLines === "number" && estimatedLines > 0;
}

export function formatLines(language: Language, value: number): string {
  return formatNumber(language, Math.round(value));
}

export function formatApprox(language: Language, value: number, approx: boolean): string {
  return approx ? `≈${NBSP}${formatLines(language, value)}` : formatLines(language, value);
}

export function formatNoiseShare(noiseShare: number | null): string {
  return noiseShare === null ? "—" : `≈${NBSP}${formatShare(noiseShare)}`;
}
