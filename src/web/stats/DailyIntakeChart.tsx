import { Bar, CartesianGrid, ComposedChart, Tooltip, XAxis, YAxis } from "recharts";
import { formatDecimal, pluralCount } from "../../core/stats/format";
import type { DayFlow } from "../../core/stats/types";
import { sum } from "../../core/stats/numbers";
import { ChartFrame, type LegendItem } from "./charts/ChartFrame";
import { axisDay, compactNumber, tooltipDay } from "./charts/chart-format";
import { AXIS_PROPS, BAR_RADIUS, CHART_MARGIN, chartLabel, DATE_AXIS_PROPS, TOOLTIP_PROPS, VALUE_AXIS_WIDTH } from "./charts/chart-style";
import { rowTooltip } from "./charts/ChartTooltip";
import { Panel } from "./Panel";

const CREATED = "var(--chart-bar-warm)";

const LEGEND: LegendItem[] = [{ label: "создано задач", shape: "bar", color: CREATED }];

const dayTooltip = rowTooltip((day: DayFlow) => ({
  title: tooltipDay(day.day),
  rows: [{ label: "создано", value: pluralCount(day.created, "задача", "задачи", "задач"), shape: "bar", color: CREATED }],
}));

export function DailyIntakePanel({ days }: { days: DayFlow[] }) {
  return (
    <Panel title="Создано по дням">
      <ChartFrame summary={intakeSummary(days)} legend={LEGEND}>
        <ComposedChart data={days} margin={CHART_MARGIN} aria-label={chartLabel("Создано по дням", "дням")}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="day" tickFormatter={axisDay} {...DATE_AXIS_PROPS} />
          <YAxis allowDecimals={false} tickFormatter={compactNumber} width={VALUE_AXIS_WIDTH} {...AXIS_PROPS} />
          <Tooltip content={dayTooltip} {...TOOLTIP_PROPS} />
          <Bar dataKey="created" fill={CREATED} radius={BAR_RADIUS} isAnimationActive={false} />
        </ComposedChart>
      </ChartFrame>
    </Panel>
  );
}

function intakeSummary(days: DayFlow[]): string {
  const created = sum(days.map((day) => day.created));
  const period = pluralCount(days.length, "день", "дня", "дней");
  if (created === 0) return `${period}: задач не создавали`;
  return `${period}: создано ${created}, в среднем ${formatDecimal(created / days.length)} в день`;
}
