import { useMemo } from "react";
import { Bar, CartesianGrid, ComposedChart, Tooltip, XAxis, YAxis } from "recharts";
import type { Language } from "../../core/i18n/language";
import type { CoreMessages } from "../../core/messages";
import type { FlowPeriod } from "../../core/api/contract";
import { sum } from "../../core/stats/numbers";
import { useLanguage, useMessages } from "../i18n";
import { ChartFrame, type LegendItem } from "./charts/ChartFrame";
import { axisDay, compactNumber, tooltipDay } from "./charts/chart-format";
import { AXIS_PROPS, BAR_RADIUS, CHART_MARGIN, DATE_AXIS_PROPS, TOOLTIP_PROPS, VALUE_AXIS_WIDTH, type Grain } from "./charts/chart-style";
import { rowTooltip } from "./charts/ChartTooltip";
import { GrainToggle } from "./GrainToggle";
import type { StatsMessages } from "./messages.ru";
import { Panel } from "./Panel";
import { useChartGrain } from "./use-chart-grain";

const CREATED = "var(--chart-bar-warm)";

function periodTooltip(stats: StatsMessages, core: CoreMessages, language: Language, grain: Grain) {
  return rowTooltip((period: FlowPeriod) => ({
    title: stats.periodOf(grain, tooltipDay(language, period.start)),
    rows: [{ label: stats.flowCreated, value: core.count(period.created, "task"), shape: "bar", color: CREATED }],
  }));
}

export function IntakePanel({ weeks, days }: { weeks: FlowPeriod[]; days: FlowPeriod[] }) {
  const { stats, core } = useMessages();
  const language = useLanguage();
  const [grain, setGrain] = useChartGrain("intake", "day");
  const tooltip = useMemo(() => periodTooltip(stats, core, language, grain), [stats, core, language, grain]);
  const legend: LegendItem[] = [{ label: stats.createdTasks, shape: "bar", color: CREATED }];
  const periods = grain === "week" ? weeks : days;
  const title = stats.createdBy[grain];
  return (
    <Panel title={title} aside={<GrainToggle chart={title} grain={grain} onChange={setGrain} />}>
      <ChartFrame summary={stats.intakeSummary(grain, periods.length, sum(periods.map((period) => period.created)))} legend={legend}>
        <ComposedChart data={periods} margin={CHART_MARGIN} aria-label={stats.chartLabel(title, grain)}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="start" tickFormatter={(day: string) => axisDay(language, day)} {...DATE_AXIS_PROPS} />
          <YAxis allowDecimals={false} tickFormatter={(value: number) => compactNumber(language, value)} width={VALUE_AXIS_WIDTH} {...AXIS_PROPS} />
          <Tooltip content={tooltip} {...TOOLTIP_PROPS} />
          <Bar dataKey="created" fill={CREATED} radius={BAR_RADIUS} isAnimationActive={false} />
        </ComposedChart>
      </ChartFrame>
    </Panel>
  );
}
