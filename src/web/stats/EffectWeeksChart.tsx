import { useId } from "react";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { NBSP, plural, pluralCount } from "../../core/stats/format";
import type { EffectPeriod, EffectTotals } from "../../core/stats/types";
import { ChartFrame, type LegendItem } from "./charts/ChartFrame";
import { axisDay, compactNumber, tooltipDay, tooltipWeek } from "./charts/chart-format";
import { AXIS_PROPS, BAR_RADIUS, CHART_MARGIN, chartLabel, DATE_AXIS_PROPS, TOOLTIP_PROPS, VALUE_AXIS_WIDTH } from "./charts/chart-style";
import { rowTooltip } from "./charts/ChartTooltip";
import { formatApprox, formatNoiseShare, isEstimated } from "./effect-format";

export type Grain = "week" | "day";

const REAL = "var(--chart-bar-neutral)";
const DEFERRED = "var(--accent-ink)";

const LEGEND: LegendItem[] = [
  { label: "в пулреквестах", shape: "bar", color: REAL },
  { label: "вынесено в беклог", shape: "hatch", color: DEFERRED },
];

const tooltipOf = (grain: Grain) =>
  rowTooltip((period: EffectPeriod) => ({
    title: grain === "week" ? tooltipWeek(period.start) : tooltipDay(period.start),
    rows: [
      { label: "в пулреквестах", value: pluralCount(Math.round(period.onTopicLines), "строка", "строки", "строк"), shape: "bar", color: REAL },
      { label: "вынесено в беклог", value: roughLines(period.deferredLines), shape: "hatch", color: DEFERRED },
      { label: "код", value: roughLines(period.deferredLines - period.deferredTestLines) },
      { label: "тесты", value: roughLines(period.deferredTestLines) },
      { label: "задач вынесено", value: String(period.deferredTasks) },
    ],
  }));

export function EffectWeeksChart({ periods, totals, grain }: { periods: EffectPeriod[]; totals: EffectTotals; grain: Grain }) {
  const patternId = useId();
  const deferredText = formatApprox(totals.deferredLines, isEstimated(totals.estimatedLines));
  const summary = `С внедрения беклога: в пулреквестах ${pluralCount(totals.realLines, "строка", "строки", "строк")}, вынесено ${deferredText}${NBSP}${plural(totals.deferredLines, "строка", "строки", "строк")}, шум без беклога ${formatNoiseShare(totals.noiseShare)}`;
  return (
    <ChartFrame summary={summary} legend={LEGEND}>
      <BarChart data={periods} margin={CHART_MARGIN} aria-label={chartLabel("Эффективность", grain === "week" ? "неделям" : "дням")}>
        <defs>
          <pattern id={patternId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="var(--surface-raised)" />
            <line x1="0" y1="0" x2="0" y2="6" stroke={DEFERRED} strokeWidth="3" />
          </pattern>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="start" tickFormatter={axisDay} {...DATE_AXIS_PROPS} />
        <YAxis tickFormatter={compactNumber} width={VALUE_AXIS_WIDTH} {...AXIS_PROPS} />
        <Tooltip content={tooltipOf(grain)} {...TOOLTIP_PROPS} />
        <Bar dataKey="onTopicLines" stackId="lines" fill={REAL} isAnimationActive={false} />
        <Bar dataKey="deferredLines" stackId="lines" fill={`url(#${patternId})`} radius={BAR_RADIUS} isAnimationActive={false} />
      </BarChart>
    </ChartFrame>
  );
}

function roughLines(lines: number): string {
  return formatApprox(lines, Math.round(lines) > 0);
}
