import { useMemo } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, Tooltip, XAxis, YAxis } from "recharts";
import type { Language } from "../../core/i18n/language";
import type { FlowPeriod } from "../../core/api/contract";
import { sum } from "../../core/stats/numbers";
import { useLanguage, useMessages } from "../i18n";
import { ChartFrame, type LegendItem } from "./charts/ChartFrame";
import { axisDay, compactNumber, tooltipDay } from "./charts/chart-format";
import { AXIS_PROPS, BAR_RADIUS, LINE_WIDTH, CHART_MARGIN, DATE_AXIS_PROPS, TOOLTIP_PROPS, VALUE_AXIS_WIDTH, type Grain } from "./charts/chart-style";
import { rowTooltip } from "./charts/ChartTooltip";
import { nonZeroDot } from "./charts/value-dot";
import { GrainToggle } from "./GrainToggle";
import type { StatsMessages } from "./messages.ru";
import { Panel } from "./Panel";
import { useGrainSeries } from "./use-grain-series";

const CREATED = "var(--chart-bar-neutral)";
const CLOSED = "var(--chart-bar-green)";
const OPEN = "var(--chart-line-bright)";

function periodTooltip(stats: StatsMessages, language: Language, grain: Grain) {
  return rowTooltip((period: FlowPeriod) => ({
    title: stats.periodOf(grain, tooltipDay(language, period.start)),
    rows: [
      { label: stats.flowCreated, value: String(period.created), shape: "bar", color: CREATED },
      { label: stats.flowClosed, value: String(period.closed), shape: "bar", color: CLOSED },
      { label: stats.flowOpen, value: String(period.openAtEnd), shape: "line", color: OPEN },
    ],
  }));
}

export function FlowPanel({ weeks, days }: { weeks: FlowPeriod[]; days: FlowPeriod[] }) {
  const { stats } = useMessages();
  const language = useLanguage();
  const { grain, periods, setGrain } = useGrainSeries("flow", "week", { week: weeks, day: days });
  const tooltip = useMemo(() => periodTooltip(stats, language, grain), [stats, language, grain]);
  const legend: LegendItem[] = [
    { label: stats.flowCreated, shape: "bar", color: CREATED },
    { label: stats.flowClosed, shape: "bar", color: CLOSED },
    { label: stats.flowOpenAtEnd[grain], shape: "line", color: OPEN },
  ];
  const title = stats.debtBy[grain];
  const summary = stats.flowSummary({
    grain,
    periodCount: periods.length,
    created: sum(periods.map((period) => period.created)),
    closed: sum(periods.map((period) => period.closed)),
    openNow: periods.at(-1)?.openAtEnd ?? 0,
  });
  const compact = (value: number) => compactNumber(language, value);
  return (
    <Panel title={title} aside={<GrainToggle chart="flow" grain={grain} onChange={setGrain} />}>
      <ChartFrame summary={summary} legend={legend}>
        <ComposedChart data={periods} margin={CHART_MARGIN} aria-label={stats.chartLabel(title, grain)}>
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
    </Panel>
  );
}
