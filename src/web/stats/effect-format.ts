import { formatShare, NBSP, plural } from "../../core/stats/format";
import type { EffectTotals } from "../../core/stats/types";

export function isEstimated(estimatedLines: number | null): boolean {
  return typeof estimatedLines === "number" && estimatedLines > 0;
}

export function formatLines(value: number): string {
  return Math.round(value).toLocaleString("ru-RU");
}

export function formatApprox(value: number, approx: boolean): string {
  return approx ? `≈${NBSP}${formatLines(value)}` : formatLines(value);
}

export function linesText(lines: number, approx: boolean): string {
  return `${formatApprox(lines, approx)}${NBSP}${plural(Math.round(lines), "строка", "строки", "строк")}`;
}

export function formatNoiseShare(noiseShare: number | null): string {
  return noiseShare === null ? "—" : `≈${NBSP}${formatShare(noiseShare)}`;
}

export function codeAndTests({ deferredLines, deferredTestLines, estimatedLines }: Pick<EffectTotals, "deferredLines" | "deferredTestLines" | "estimatedLines">): string {
  const approx = isEstimated(estimatedLines);
  return `код ${formatApprox(deferredLines - deferredTestLines, approx)}, тесты ${formatApprox(deferredTestLines, approx)}`;
}
