import { useId, useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import type { Language } from "../../core/i18n/language";
import type { CoreMessages } from "../../core/messages";
import type { EffectPeriod, EffectTotals } from "../../core/api/contract";
import { useLanguage, useMessages } from "../i18n";
import { ChartFrame, type LegendItem } from "./charts/ChartFrame";
import { axisDay, compactNumber, tooltipDay } from "./charts/chart-format";
import { AXIS_PROPS, BAR_RADIUS, CHART_MARGIN, DATE_AXIS_PROPS, TOOLTIP_PROPS, VALUE_AXIS_WIDTH, type Grain } from "./charts/chart-style";
import { rowTooltip } from "./charts/ChartTooltip";
import { formatApprox, formatNoiseShare, isEstimated } from "./effect-format";
import type { StatsMessages } from "./messages.ru";

const REAL = "var(--chart-bar-neutral)";
const DEFERRED = "var(--accent-ink)";

function periodTooltip(stats: StatsMessages, core: CoreMessages, language: Language, grain: Grain) {
  const roughLines = (lines: number) => formatApprox(language, lines, Math.round(lines) > 0);
  return rowTooltip((period: EffectPeriod) => ({
    title: stats.periodOf(grain, tooltipDay(language, period.start)),
    rows: [
      { label: stats.inPullRequests, value: core.count(Math.round(period.onTopicLines), "line"), shape: "bar", color: REAL },
      { label: stats.deferredSeries, value: roughLines(period.deferredLines), shape: "hatch", color: DEFERRED },
      { label: stats.codeLines, value: roughLines(period.deferredLines - period.deferredTestLines) },
      { label: stats.testLines, value: roughLines(period.deferredTestLines) },
      { label: stats.deferredTasks, value: String(period.deferredTasks) },
    ],
  }));
}

export function EffectChart({ periods, totals, grain }: { periods: EffectPeriod[]; totals: EffectTotals; grain: Grain }) {
  const { stats, core } = useMessages();
  const language = useLanguage();
  const tooltip = useMemo(() => periodTooltip(stats, core, language, grain), [stats, core, language, grain]);
  const patternId = useId();
  const legend: LegendItem[] = [
    { label: stats.inPullRequests, shape: "bar", color: REAL },
    { label: stats.deferredSeries, shape: "hatch", color: DEFERRED },
  ];
  const deferred = stats.linesText(totals.deferredLines, isEstimated(totals.estimatedLines));
  const summary = stats.effectSummary(totals.realLines, deferred, formatNoiseShare(totals.noiseShare));
  return (
    <ChartFrame summary={summary} legend={legend}>
      <BarChart data={periods} margin={CHART_MARGIN} aria-label={stats.chartLabel(stats.effectTitle, grain)}>
        <defs>
          <pattern id={patternId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="var(--surface-raised)" />
            <line x1="0" y1="0" x2="0" y2="6" stroke={DEFERRED} strokeWidth="3" />
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
