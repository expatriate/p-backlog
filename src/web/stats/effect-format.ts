import { formatWhole } from "../../core/i18n/format";
import type { Language } from "../../core/i18n/language";
import type { EffectPeriod } from "../../core/api/contract";
import { formatShare } from "../../core/stats/format";
import { approx, exactly } from "./value-format";
import { NO_VALUE } from "../labels";

type DeferredLines = Pick<EffectPeriod, "deferredLines" | "deferredTestLines">;

function includesEstimate(estimatedLines: number | null): boolean {
  return estimatedLines !== null && estimatedLines > 0;
}

export function formatLines(language: Language, lines: number, estimatedLines: number | null): string {
  return markEstimated(formatWhole(language, lines), estimatedLines);
}

export function formatEstimate(language: Language, estimatedLines: number): string {
  return formatLines(language, estimatedLines, estimatedLines);
}

export function deferredCodeLines({ deferredLines, deferredTestLines }: DeferredLines): number {
  return deferredLines - deferredTestLines;
}

export function formatNoiseShare(noiseShare: number | null, estimatedLines: number | null): string {
  return noiseShare === null ? NO_VALUE : markEstimated(formatShare(noiseShare), estimatedLines);
}

export function formatFormulaShare(noiseShare: number, estimatedLines: number | null): string {
  const share = formatShare(noiseShare);
  return includesEstimate(estimatedLines) ? approx(share) : exactly(share);
}

function markEstimated(text: string, estimatedLines: number | null): string {
  return includesEstimate(estimatedLines) ? approx(text) : text;
}
