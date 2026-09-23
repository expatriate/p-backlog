import { Bar, CartesianGrid, ComposedChart, Line, Tooltip, XAxis, YAxis } from "recharts";
import { formatShare } from "../../core/stats/format";
import { countRu } from "../../core/i18n/plural";
import type { AccuracyWeek } from "../../core/stats/types";
import { sum } from "../../core/stats/numbers";
import { ChartFrame, type LegendItem } from "./charts/ChartFrame";
import { axisDay, tooltipWeek } from "./charts/chart-format";
import { AXIS_PROPS, BAR_RADIUS, CHART_MARGIN, chartLabel, DATE_AXIS_PROPS, TOOLTIP_PROPS, VALUE_AXIS_WIDTH } from "./charts/chart-style";
import { rowTooltip } from "./charts/ChartTooltip";
import { nonZeroDot } from "./charts/value-dot";

const DECIDED = "var(--chart-bar-neutral)";
const PRECISION = "var(--chart-line-green)";

const LEGEND: LegendItem[] = [
  { label: "решено кандидатов", shape: "bar", color: DECIDED },
  { label: "точность", shape: "line", color: PRECISION },
];

const weekTooltip = rowTooltip((week: AccuracyWeek) => ({
  title: tooltipWeek(week.start),
  rows: [
    { label: "решено кандидатов", value: String(week.decided), shape: "bar", color: DECIDED },
    { label: "точность", value: formatShare(week.precision), shape: "line", color: PRECISION },
  ],
}));

export function AccuracyWeeksChart({ weeks }: { weeks: AccuracyWeek[] }) {
  const decided = sum(weeks.map((week) => week.decided));
  const withPrecision = weeks.filter((week) => week.precision !== null);
  const latest = withPrecision.at(-1);
  const summary =
    latest === undefined
      ? `${countRu(weeks.length, "неделя", "недели", "недель")}: решённых кандидатов нет`
      : `${countRu(weeks.length, "неделя", "недели", "недель")}: решено ${decided}, точность на последней неделе ${formatShare(latest.precision)}`;

  return (
    <ChartFrame summary={summary} legend={LEGEND}>
      <ComposedChart data={weeks} margin={CHART_MARGIN} aria-label={chartLabel("Точность проверки", "неделям")}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="start" tickFormatter={axisDay} {...DATE_AXIS_PROPS} />
        <YAxis yAxisId="decided" width={VALUE_AXIS_WIDTH} {...AXIS_PROPS} />
        <YAxis
          yAxisId="precision"
          orientation="right"
          domain={[0, 1]}
          tickFormatter={(share: number) => `${Math.round(share * 100)}%`}
          width={VALUE_AXIS_WIDTH}
          {...AXIS_PROPS}
        />
        <Tooltip content={weekTooltip} {...TOOLTIP_PROPS} />
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
