import { useId } from "react";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { NBSP, plural, pluralCount } from "../../core/stats/format";
import type { EffectTotals, EffectWeek } from "../../core/stats/types";
import { ChartFrame, type LegendItem } from "./charts/ChartFrame";
import { axisDay, compactNumber, tooltipWeek } from "./charts/chart-format";
import { AXIS_PROPS, BAR_RADIUS, CHART_MARGIN, chartTitle, DATE_AXIS_PROPS, TOOLTIP_PROPS, VALUE_AXIS_WIDTH } from "./charts/chart-style";
import { rowTooltip } from "./charts/ChartTooltip";
import { formatApprox, formatNoiseShare, isEstimated } from "./effect-format";

const REAL = "var(--chart-bar-neutral)";
const DEFERRED = "var(--accent-ink)";

const LEGEND: LegendItem[] = [
  { label: "в пулреквестах", shape: "bar", color: REAL },
  { label: "вынесено в беклог", shape: "hatch", color: DEFERRED },
];

const weekTooltip = rowTooltip((week: EffectWeek) => ({
  title: tooltipWeek(week.start),
  rows: [
    { label: "в пулреквестах", value: pluralCount(week.onTopicLines, "строка", "строки", "строк"), shape: "bar", color: REAL },
    { label: "вынесено в беклог", value: pluralCount(week.deferredLines, "строка", "строки", "строк"), shape: "hatch", color: DEFERRED },
    { label: "задач вынесено", value: String(week.deferredTasks) },
  ],
}));

export function EffectWeeksChart({ weeks, totals }: { weeks: EffectWeek[]; totals: EffectTotals }) {
  const patternId = useId();
  const deferredText = formatApprox(totals.deferredLines, isEstimated(totals.estimatedLines));
  const summary = `${pluralCount(weeks.length, "неделя", "недели", "недель")}: в пулреквестах ${pluralCount(totals.realLines, "строка", "строки", "строк")}, вынесено ${deferredText}${NBSP}${plural(totals.deferredLines, "строка", "строки", "строк")}, шум без беклога ${formatNoiseShare(totals.noiseShare)}`;
  return (
    <ChartFrame summary={summary} legend={LEGEND}>
      <BarChart data={weeks} margin={CHART_MARGIN} title={chartTitle("Без беклога и с ним", "неделям")}>
        <defs>
          <pattern id={patternId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="var(--surface-raised)" />
            <line x1="0" y1="0" x2="0" y2="6" stroke={DEFERRED} strokeWidth="3" />
          </pattern>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="start" tickFormatter={axisDay} {...DATE_AXIS_PROPS} />
        <YAxis tickFormatter={compactNumber} width={VALUE_AXIS_WIDTH} {...AXIS_PROPS} />
        <Tooltip content={weekTooltip} {...TOOLTIP_PROPS} />
        <Bar dataKey="onTopicLines" stackId="lines" fill={REAL} isAnimationActive={false} />
        <Bar dataKey="deferredLines" stackId="lines" fill={`url(#${patternId})`} radius={BAR_RADIUS} isAnimationActive={false} />
      </BarChart>
    </ChartFrame>
  );
}
