import { formatShare, NBSP } from "../../core/stats/format";

export function isEstimated(estimatedLines: number | null): boolean {
  return typeof estimatedLines === "number" && estimatedLines > 0;
}

export function formatLines(value: number): string {
  return Math.round(value).toLocaleString("ru-RU");
}

export function formatApprox(value: number, approx: boolean): string {
  return approx ? `≈${NBSP}${formatLines(value)}` : formatLines(value);
}

export function formatNoiseShare(noiseShare: number | null): string {
  return noiseShare === null ? "—" : `≈${NBSP}${formatShare(noiseShare)}`;
}
