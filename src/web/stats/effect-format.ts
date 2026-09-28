import type { Language } from "../../core/i18n/language";
import type { EffectPeriod } from "../../core/api/contract";
import { formatShare } from "../../core/stats/format";
import { approx, formatWhole } from "./value-format";
import { NO_VALUE } from "../labels";

type DeferredLines = Pick<EffectPeriod, "deferredLines" | "deferredTestLines">;

export function formatLines(language: Language, lines: number, estimatedPart: number | null): string {
  return markEstimated(formatWhole(language, lines), estimatedPart);
}

export function deferredCodeLines({ deferredLines, deferredTestLines }: DeferredLines): number {
  return deferredLines - deferredTestLines;
}

export function formatNoiseShare(noiseShare: number | null, estimatedPart: number | null): string {
  return noiseShare === null ? NO_VALUE : markEstimated(formatShare(noiseShare), estimatedPart);
}

function markEstimated(text: string, estimatedPart: number | null): string {
  return typeof estimatedPart === "number" && estimatedPart > 0 ? approx(text) : text;
}
