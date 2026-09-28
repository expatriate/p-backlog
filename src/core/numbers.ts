const PERCENT = 100;

export function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

export function toPercent(share: number): number {
  return Math.round(share * PERCENT);
}

export function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? null;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

export function nearestRank(values: readonly number[], fraction: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(fraction * sorted.length) - 1] ?? null;
}

export function smallest(values: readonly number[]): number | null {
  return values.reduce<number | null>((least, value) => (least === null || value < least ? value : least), null);
}
