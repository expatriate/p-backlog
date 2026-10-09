import type { Language } from "../../core/i18n/language";
import type { EffectPeriod, EffectTotals } from "../../core/api/contract";
import { sum } from "../../core/numbers";
import { useLanguage, useMessages } from "../i18n";
import type { Grain } from "./charts/chart-style";
import { PeriodChart } from "./charts/PeriodChart";
import type { SeriesEntry } from "./charts/series";
import { formatLines, formatNoiseShare } from "./effect-format";
import { formatWhole } from "./value-format";
import type { StatsMessages } from "./messages.ru";
import { codeAndTestsLines, linesAmount } from "./summaries";

const REAL = "var(--chart-bar-neutral)";
const DEFERRED = "var(--accent-ink)";

export function EffectChart({ periods, totals, grain }: { periods: EffectPeriod[]; totals: EffectTotals; grain: Grain }) {
  const { stats, core } = useMessages();
  const language = useLanguage();
  const lines = (value: number, period: EffectPeriod) => formatLines(language, value, period.estimatedLines);
  const series: SeriesEntry<EffectPeriod>[] = [
    { key: "onTopicLines", label: stats.onTopicSeries, shape: "bar", color: REAL, stack: "lines", format: (onTopic) => core.count(Math.round(onTopic), "line") },
    { key: "deferredLines", label: stats.deferredSeries, shape: "hatch", color: DEFERRED, stack: "lines", format: lines },
    { label: stats.codeLines, format: (period) => codeAndTestsLines(language, period).code },
    { label: stats.testLines, format: (period) => codeAndTestsLines(language, period).tests },
    { label: stats.deferredTasks, format: (period) => formatWhole(language, period.deferredTasks) },
  ];
  return <PeriodChart name={stats.effectTitle} grain={grain} summary={effectSummary(stats, language, grain, periods, totals)} data={periods} series={series} />;
}

function effectSummary(stats: StatsMessages, language: Language, grain: Grain, periods: EffectPeriod[], totals: EffectTotals): string {
  const deferredText = (lines: number, estimatedPart: number | null) => stats.linesText(linesAmount(language, lines, estimatedPart));
  if (grain === "week") return stats.effectSummary(totals.realLines, deferredText(totals.deferredLines, totals.estimatedLines), formatNoiseShare(totals.noiseShare, totals.estimatedLines));
  const total = (pick: (period: EffectPeriod) => number) => sum(periods.map(pick));
  const deferred = deferredText(
    total((period) => period.deferredLines),
    total((period) => period.estimatedLines ?? 0),
  );
  return stats.effectDaysSummary(periods.length, Math.round(total((period) => period.onTopicLines)), deferred);
}
