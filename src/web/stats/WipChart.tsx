import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { pluralCount } from "../../core/stats/format";
import type { FlowWip, WipWeek } from "../../core/stats/types";
import { ChartFrame } from "./charts/ChartFrame";
import { axisDay, compactNumber, tooltipWeek } from "./charts/chart-format";
import { AXIS_PROPS, BAR_RADIUS, CHART_MARGIN, chartTitle, DATE_AXIS_PROPS, TOOLTIP_PROPS, VALUE_AXIS_WIDTH } from "./charts/chart-style";
import { rowTooltip } from "./charts/ChartTooltip";

const WIP = "var(--ink-muted)";

const weekTooltip = rowTooltip((week: WipWeek) => ({
  title: tooltipWeek(week.start),
  rows: [{ label: "максимум в работе", value: week.max === null ? "нет данных" : String(week.max), shape: "bar", color: WIP }],
}));

export function WipChart({ wip }: { wip: FlowWip }) {
  const known = wip.weeks.flatMap((week) => (week.max === null ? [] : [week.max]));
  const peak = known.length === 0 ? "—" : String(Math.max(...known));
  return (
    <ChartFrame summary={`${pluralCount(wip.weeks.length, "неделя", "недели", "недель")}: сейчас в работе ${wip.current}, максимум ${peak}`} legend={[]}>
      <BarChart data={wip.weeks} margin={CHART_MARGIN} title={chartTitle("В работе одновременно", "неделям")}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="start" tickFormatter={axisDay} {...DATE_AXIS_PROPS} />
        <YAxis allowDecimals={false} tickFormatter={compactNumber} width={VALUE_AXIS_WIDTH} {...AXIS_PROPS} />
        <Tooltip content={weekTooltip} {...TOOLTIP_PROPS} />
        <Bar dataKey="max" fill={WIP} radius={BAR_RADIUS} isAnimationActive={false} />
      </BarChart>
    </ChartFrame>
  );
}
