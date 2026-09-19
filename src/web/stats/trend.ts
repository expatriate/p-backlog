import { NBSP } from "../../core/stats/format";
import type { FigureTrend } from "./Figure";

const DOWN = "↓";
const UP = "↑";

export function trendOf(current: number | null, previous: number | null, format: (value: number) => string): FigureTrend | undefined {
  if (current === null || previous === null) return undefined;
  const change = current - previous;
  if (change === 0) return undefined;
  const better = change < 0;
  const size = format(Math.abs(change));
  return {
    text: `${better ? DOWN : UP}${NBSP}${size}${NBSP}за${NBSP}неделю`,
    speech: `на ${size} ${better ? "меньше" : "больше"}, чем неделю назад — ${better ? "лучше" : "хуже"}`,
    better,
  };
}
