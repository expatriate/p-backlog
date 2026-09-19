import { formatDecimal, formatMoney, NBSP } from "../../core/stats/format";
import { formatLines } from "./effect-format";

export function formatMb(value: number | null): string {
  return value === null ? "—" : `${formatDecimal(value)}${NBSP}МБ`;
}

export function formatMs(value: number): string {
  return `${formatLines(value)}${NBSP}мс`;
}

export function costValue(cost: number | null): string {
  return cost === null ? "—" : `≈${NBSP}${formatMoney(cost)}`;
}

export function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
