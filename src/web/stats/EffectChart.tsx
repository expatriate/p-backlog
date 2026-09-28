import { useId, useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { formatDay } from "../../core/i18n/format";
import type { Language } from "../../core/i18n/language";
import type { CoreMessages } from "../../core/messages";
import type { EffectPeriod, EffectTotals } from "../../core/api/contract";
import { sum } from "../../core/numbers";
import { useLanguage, useMessages } from "../i18n";
import { ChartFrame, type LegendItem } from "./charts/ChartFrame";
import { axisDay, compactNumber } from "./charts/chart-format";
import { AXIS_PROPS, BAR_RADIUS, CHART_MARGIN, DATE_AXIS_PROPS, TOOLTIP_PROPS, VALUE_AXIS_WIDTH, type Grain } from "./charts/chart-style";
import { rowTooltip } from "./charts/ChartTooltip";
import { deferredCodeLines, formatLines, formatNoiseShare } from "./effect-format";
import { formatWhole } from "./value-format";
import type { StatsMessages } from "./messages.ru";

const REAL = "var(--chart-bar-neutral)";
const DEFERRED = "var(--accent-ink)";
const HATCH_SIZE = 6;
const HATCH_STROKE_WIDTH = 3;

function periodTooltip(stats: StatsMessages, core: CoreMessages, language: Language, grain: Grain) {
  return rowTooltip((period: EffectPeriod) => {
    const lines = (value: number) => formatLines(language, value, period.estimatedLines);
    return {
      title: stats.periodOf(grain, formatDay(language, period.start)),
      rows: [
        { label: stats.onTopicSeries, value: core.count(Math.round(period.onTopicLines), "line"), shape: "bar", color: REAL },
        { label: stats.deferredSeries, value: lines(period.deferredLines), shape: "hatch", color: DEFERRED },
        { label: stats.codeLines, value: lines(deferredCodeLines(period)) },
        { label: stats.testLines, value: lines(period.deferredTestLines) },
        { label: stats.deferredTasks, value: formatWhole(language, period.deferredTasks) },
      ],
    };
  });
}

export function EffectChart({ periods, totals, grain }: { periods: EffectPeriod[]; totals: EffectTotals; grain: Grain }) {
  const { stats, core } = useMessages();
  const language = useLanguage();
  const tooltip = useMemo(() => periodTooltip(stats, core, language, grain), [stats, core, language, grain]);
  const patternId = useId();
  const legend: LegendItem[] = [
    { label: stats.onTopicSeries, shape: "bar", color: REAL },
    { label: stats.deferredSeries, shape: "hatch", color: DEFERRED },
  ];
  return (
    <ChartFrame summary={effectSummary(stats, grain, periods, totals)} legend={legend}>
      <BarChart data={periods} margin={CHART_MARGIN} aria-label={stats.chartLabel(stats.effectTitle, grain)}>
        <defs>
          <pattern id={patternId} width={HATCH_SIZE} height={HATCH_SIZE} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width={HATCH_SIZE} height={HATCH_SIZE} fill="var(--surface-raised)" />
            <line x1={0} y1={0} x2={0} y2={HATCH_SIZE} stroke={DEFERRED} strokeWidth={HATCH_STROKE_WIDTH} />
          </pattern>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="start" tickFormatter={(day: string) => axisDay(language, day)} {...DATE_AXIS_PROPS} />
        <YAxis tickFormatter={(value: number) => compactNumber(language, value)} width={VALUE_AXIS_WIDTH} {...AXIS_PROPS} />
        <Tooltip content={tooltip} {...TOOLTIP_PROPS} />
        <Bar dataKey="onTopicLines" stackId="lines" fill={REAL} isAnimationActive={false} />
        <Bar dataKey="deferredLines" stackId="lines" fill={`url(#${patternId})`} radius={BAR_RADIUS} isAnimationActive={false} />
      </BarChart>
    </ChartFrame>
  );
}

function effectSummary(stats: StatsMessages, grain: Grain, periods: EffectPeriod[], totals: EffectTotals): string {
  if (grain === "week") return stats.effectSummary(totals.realLines, stats.linesText(totals.deferredLines, totals.estimatedLines), formatNoiseShare(totals.noiseShare));
  const total = (pick: (period: EffectPeriod) => number) => sum(periods.map(pick));
  const deferred = stats.linesText(total((period) => period.deferredLines), total((period) => period.estimatedLines ?? 0));
  return stats.effectDaysSummary(periods.length, Math.round(total((period) => period.onTopicLines)), deferred);
}
