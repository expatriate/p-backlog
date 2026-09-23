import type { FigureTrend } from "./Figure";
import type { StatsMessages } from "./messages.ru";

const DOWN = "↓";
const UP = "↑";

export function trendOf(stats: StatsMessages, current: number | null, previous: number | null, format: (value: number) => string): FigureTrend | undefined {
  if (current === null || previous === null) return undefined;
  const change = current - previous;
  if (change === 0) return undefined;
  const better = change < 0;
  const size = format(Math.abs(change));
  return { text: stats.weekTrend(better ? DOWN : UP, size), speech: stats.weekTrendSpeech(size, better), better };
}
