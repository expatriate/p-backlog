import type { FigureTone, FigureTrend } from "./Figure";
import type { StatsMessages } from "./messages.ru";

const ARROWS: Record<FigureTone, string> = { decline: "↓", growth: "↑" };

export function trendOf(stats: StatsMessages, current: number | null, previous: number | null): FigureTrend | undefined {
  if (current === null || previous === null) return undefined;
  const change = current - previous;
  if (change === 0) return undefined;
  const tone: FigureTone = change < 0 ? "decline" : "growth";
  const size = String(Math.abs(change));
  return { text: stats.weekTrend(ARROWS[tone], size), speech: stats.weekTrendSpeech[tone](size), tone };
}
