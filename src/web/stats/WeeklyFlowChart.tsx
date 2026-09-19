import { Bar, CartesianGrid, ComposedChart, Line, Tooltip, XAxis, YAxis } from "recharts";
import { pluralCount } from "../../core/stats/format";
import type { WeekFlow } from "../../core/stats/types";
import { ChartFrame, type LegendItem } from "./charts/ChartFrame";
import { axisDay, compactNumber, tooltipWeek } from "./charts/chart-format";
import { AXIS_PROPS, BAR_RADIUS, LINE_WIDTH, CHART_MARGIN, chartTitle, DATE_AXIS_PROPS, TOOLTIP_PROPS, VALUE_AXIS_WIDTH } from "./charts/chart-style";
import { rowTooltip } from "./charts/ChartTooltip";
import { nonZeroDot } from "./charts/value-dot";

const CREATED = "var(--chart-bar-neutral)";
const CLOSED = "var(--chart-bar-green)";
const OPEN = "var(--chart-line-bright)";

const LEGEND: LegendItem[] = [
  { label: "создано", shape: "bar", color: CREATED },
  { label: "закрыто", shape: "bar", color: CLOSED },
  { label: "открыто на конец недели", shape: "line", color: OPEN },
];

const weekTooltip = rowTooltip((week: WeekFlow) => ({
  title: tooltipWeek(week.start),
  rows: [
    { label: "создано", value: String(week.created), shape: "bar", color: CREATED },
    { label: "закрыто", value: String(week.closed), shape: "bar", color: CLOSED },
    { label: "открыто", value: String(week.openAtEnd), shape: "line", color: OPEN },
  ],
}));

export function WeeklyFlowChart({ weeks }: { weeks: WeekFlow[] }) {
  const created = weeks.reduce((sum, week) => sum + week.created, 0);
  const closed = weeks.reduce((sum, week) => sum + week.closed, 0);
  const openNow = weeks.at(-1)?.openAtEnd ?? 0;
  const summary = `${pluralCount(weeks.length, "неделя", "недели", "недель")}: создано ${created}, закрыто ${closed}, открыто сейчас ${openNow}`;
  return (
    <ChartFrame summary={summary} legend={LEGEND}>
      <ComposedChart data={weeks} margin={CHART_MARGIN} title={chartTitle("Долг по неделям", "неделям")}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="start" tickFormatter={axisDay} {...DATE_AXIS_PROPS} />
        <YAxis yAxisId="flow" allowDecimals={false} tickFormatter={compactNumber} width={VALUE_AXIS_WIDTH} {...AXIS_PROPS} />
        <YAxis yAxisId="open" orientation="right" allowDecimals={false} tickFormatter={compactNumber} width={VALUE_AXIS_WIDTH} {...AXIS_PROPS} />
        <Tooltip content={weekTooltip} {...TOOLTIP_PROPS} />
        <Bar yAxisId="flow" dataKey="created" fill={CREATED} radius={BAR_RADIUS} isAnimationActive={false} />
        <Bar yAxisId="flow" dataKey="closed" fill={CLOSED} radius={BAR_RADIUS} isAnimationActive={false} />
        <Line yAxisId="open" dataKey="openAtEnd" stroke={OPEN} strokeWidth={LINE_WIDTH} dot={nonZeroDot(OPEN)} isAnimationActive={false} />
      </ComposedChart>
    </ChartFrame>
  );
}
