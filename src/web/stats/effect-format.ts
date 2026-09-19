import { formatShare } from "../../core/stats/format";

export function isEstimated(estimatedLines: number | null): boolean {
  return typeof estimatedLines === "number" && estimatedLines > 0;
}

export function formatApprox(value: number, approx: boolean): string {
  return approx ? `≈ ${value}` : String(value);
}

export function formatNoiseShare(noiseShare: number | null): string {
  return noiseShare === null ? "—" : `≈ ${formatShare(noiseShare)}`;
}
