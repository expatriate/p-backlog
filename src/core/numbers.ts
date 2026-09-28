export function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

export function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
