import { useMemo } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, Tooltip, XAxis, YAxis } from "recharts";
import type { Language } from "../../core/i18n/language";
import type { FlowPeriod } from "../../core/api/contract";
import { sum } from "../../core/stats/numbers";
import { useLanguage, useMessages } from "../i18n";
import { ChartFrame, type LegendItem } from "./charts/ChartFrame";
import { axisDay, compactNumber, tooltipDay } from "./charts/chart-format";
import { AXIS_PROPS, BAR_RADIUS, LINE_WIDTH, CHART_MARGIN, DATE_AXIS_PROPS, TOOLTIP_PROPS, VALUE_AXIS_WIDTH } from "./charts/chart-style";
import { rowTooltip } from "./charts/ChartTooltip";
import { nonZeroDot } from "./charts/value-dot";
import type { StatsMessages } from "./messages.ru";

const CREATED = "var(--chart-bar-neutral)";
const CLOSED = "var(--chart-bar-green)";
const OPEN = "var(--chart-line-bright)";

function weekTooltip(stats: StatsMessages, language: Language) {
  return rowTooltip((week: FlowPeriod) => ({
    title: stats.weekOf(tooltipDay(language, week.start)),
    rows: [
      { label: stats.flowCreated, value: String(week.created), shape: "bar", color: CREATED },
      { label: stats.flowClosed, value: String(week.closed), shape: "bar", color: CLOSED },
      { label: stats.flowOpen, value: String(week.openAtEnd), shape: "line", color: OPEN },
    ],
  }));
}

export function WeeklyFlowChart({ weeks }: { weeks: FlowPeriod[] }) {
  const { stats } = useMessages();
  const language = useLanguage();
  const tooltip = useMemo(() => weekTooltip(stats, language), [stats, language]);
  const legend: LegendItem[] = [
    { label: stats.flowCreated, shape: "bar", color: CREATED },
    { label: stats.flowClosed, shape: "bar", color: CLOSED },
    { label: stats.flowOpenAtWeekEnd, shape: "line", color: OPEN },
  ];
  const summary = stats.flowSummary({
    weekCount: weeks.length,
    created: sum(weeks.map((week) => week.created)),
    closed: sum(weeks.map((week) => week.closed)),
    openNow: weeks.at(-1)?.openAtEnd ?? 0,
  });
  const compact = (value: number) => compactNumber(language, value);
  return (
    <ChartFrame summary={summary} legend={legend}>
      <ComposedChart data={weeks} margin={CHART_MARGIN} aria-label={stats.chartLabel(stats.debtByWeek, "week")}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="start" tickFormatter={(day: string) => axisDay(language, day)} {...DATE_AXIS_PROPS} />
        <YAxis yAxisId="flow" allowDecimals={false} tickFormatter={compact} width={VALUE_AXIS_WIDTH} {...AXIS_PROPS} />
        <YAxis yAxisId="open" orientation="right" allowDecimals={false} tickFormatter={compact} width={VALUE_AXIS_WIDTH} {...AXIS_PROPS} />
        <Tooltip content={tooltip} {...TOOLTIP_PROPS} />
        <Bar yAxisId="flow" dataKey="created" fill={CREATED} radius={BAR_RADIUS} isAnimationActive={false} />
        <Bar yAxisId="flow" dataKey="closed" fill={CLOSED} radius={BAR_RADIUS} isAnimationActive={false} />
        <Line yAxisId="open" dataKey="openAtEnd" stroke={OPEN} strokeWidth={LINE_WIDTH} dot={nonZeroDot(OPEN)} isAnimationActive={false} />
      </ComposedChart>
    </ChartFrame>
  );
}
