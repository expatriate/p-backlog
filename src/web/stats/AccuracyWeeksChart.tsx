import { useMemo } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, Tooltip, XAxis, YAxis } from "recharts";
import type { Language } from "../../core/i18n/language";
import { formatShare } from "../../core/stats/format";
import type { AccuracyWeek } from "../../core/stats/types";
import { sum } from "../../core/stats/numbers";
import { useLanguage, useMessages } from "../i18n";
import { ChartFrame, type LegendItem } from "./charts/ChartFrame";
import { axisDay, tooltipDay } from "./charts/chart-format";
import { AXIS_PROPS, BAR_RADIUS, CHART_MARGIN, DATE_AXIS_PROPS, TOOLTIP_PROPS, VALUE_AXIS_WIDTH } from "./charts/chart-style";
import { rowTooltip } from "./charts/ChartTooltip";
import { nonZeroDot } from "./charts/value-dot";
import type { StatsMessages } from "./messages.ru";

const DECIDED = "var(--chart-bar-neutral)";
const PRECISION = "var(--chart-line-green)";

function weekTooltip(stats: StatsMessages, language: Language) {
  return rowTooltip((week: AccuracyWeek) => ({
    title: stats.weekOf(tooltipDay(language, week.start)),
    rows: [
      { label: stats.decidedCandidates, value: String(week.decided), shape: "bar", color: DECIDED },
      { label: stats.precision, value: formatShare(week.precision), shape: "line", color: PRECISION },
    ],
  }));
}

export function AccuracyWeeksChart({ weeks }: { weeks: AccuracyWeek[] }) {
  const { stats } = useMessages();
  const language = useLanguage();
  const tooltip = useMemo(() => weekTooltip(stats, language), [stats, language]);
  const legend: LegendItem[] = [
    { label: stats.decidedCandidates, shape: "bar", color: DECIDED },
    { label: stats.precision, shape: "line", color: PRECISION },
  ];
  const decided = sum(weeks.map((week) => week.decided));
  const latest = weeks.filter((week) => week.precision !== null).at(-1);
  const summary = stats.accuracySummary(weeks.length, decided, latest === undefined ? null : formatShare(latest.precision));

  return (
    <ChartFrame summary={summary} legend={legend}>
      <ComposedChart data={weeks} margin={CHART_MARGIN} aria-label={stats.chartLabel(stats.accuracyTitle, "week")}>
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
