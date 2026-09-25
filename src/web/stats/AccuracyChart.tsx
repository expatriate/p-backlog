import { useMemo } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, Tooltip, XAxis, YAxis } from "recharts";
import type { Language } from "../../core/i18n/language";
import { formatShare } from "../../core/stats/format";
import type { AccuracyPeriod } from "../../core/api/contract";
import { sum } from "../../core/stats/numbers";
import { useLanguage, useMessages } from "../i18n";
import { ChartFrame, type LegendItem } from "./charts/ChartFrame";
import { axisDay, tooltipDay } from "./charts/chart-format";
import { AXIS_PROPS, BAR_RADIUS, CHART_MARGIN, DATE_AXIS_PROPS, TOOLTIP_PROPS, VALUE_AXIS_WIDTH, type Grain } from "./charts/chart-style";
import { rowTooltip } from "./charts/ChartTooltip";
import { nonZeroDot } from "./charts/value-dot";
import type { StatsMessages } from "./messages.ru";

const DECIDED = "var(--chart-bar-neutral)";
const PRECISION = "var(--chart-line-green)";

function periodTooltip(stats: StatsMessages, language: Language, grain: Grain) {
  return rowTooltip((period: AccuracyPeriod) => ({
    title: stats.periodOf(grain, tooltipDay(language, period.start)),
    rows: [
      { label: stats.decidedCandidates, value: String(period.decided), shape: "bar", color: DECIDED },
      { label: stats.precision, value: formatShare(period.precision), shape: "line", color: PRECISION },
    ],
  }));
}

export function AccuracyChart({ periods, grain }: { periods: AccuracyPeriod[]; grain: Grain }) {
  const { stats } = useMessages();
  const language = useLanguage();
  const tooltip = useMemo(() => periodTooltip(stats, language, grain), [stats, language, grain]);
  const legend: LegendItem[] = [
    { label: stats.decidedCandidates, shape: "bar", color: DECIDED },
    { label: stats.precision, shape: "line", color: PRECISION },
  ];
  const decided = sum(periods.map((period) => period.decided));
  const latest = periods.filter((period) => period.precision !== null).at(-1);
  const summary = stats.accuracySummary({ grain, periodCount: periods.length, decided, latestPrecision: latest === undefined ? null : formatShare(latest.precision) });

  return (
    <ChartFrame summary={summary} legend={legend}>
      <ComposedChart data={periods} margin={CHART_MARGIN} aria-label={stats.chartLabel(stats.accuracyTitle, grain)}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="start" tickFormatter={(day: string) => axisDay(language, day)} {...DATE_AXIS_PROPS} />
        <YAxis yAxisId="decided" width={VALUE_AXIS_WIDTH} {...AXIS_PROPS} />
        <YAxis
          yAxisId="precision"
          orientation="right"
          domain={[0, 1]}
          tickFormatter={(share: number) => `${Math.round(share * 100)}%`}
          width={VALUE_AXIS_WIDTH}
          {...AXIS_PROPS}
        />
        <Tooltip content={tooltip} {...TOOLTIP_PROPS} />
        <Bar yAxisId="decided" dataKey="decided" fill={DECIDED} radius={BAR_RADIUS} isAnimationActive={false} />
        <Line
          yAxisId="precision"
          type="monotone"
          dataKey="precision"
          stroke={PRECISION}
          strokeWidth={2}
          connectNulls
          dot={nonZeroDot(PRECISION)}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ChartFrame>
  );
}
