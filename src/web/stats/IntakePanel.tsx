import { useMemo } from "react";
import { Bar, CartesianGrid, ComposedChart, Tooltip, XAxis, YAxis } from "recharts";
import { formatDay } from "../../core/i18n/format";
import type { Language } from "../../core/i18n/language";
import type { CoreMessages } from "../../core/messages";
import type { FlowPeriod, GrainPeriods } from "../../core/api/contract";
import { useLanguage, useMessages } from "../i18n";
import { ChartFrame, type LegendItem } from "./charts/ChartFrame";
import { axisDay, compactNumber } from "./charts/chart-format";
import { AXIS_PROPS, BAR_RADIUS, CHART_MARGIN, DATE_AXIS_PROPS, TOOLTIP_PROPS, VALUE_AXIS_WIDTH, type Grain } from "./charts/chart-style";
import { rowTooltip } from "./charts/ChartTooltip";
import type { StatsMessages } from "./messages.ru";
import { Panel } from "./Panel";
import { summarizeIntake } from "./summaries";
import { useGrainPanel } from "./use-grain-panel";

const CREATED = "var(--chart-bar-warm)";

function periodTooltip(stats: StatsMessages, core: CoreMessages, language: Language, grain: Grain) {
  return rowTooltip((period: FlowPeriod) => ({
    title: stats.periodOf(grain, formatDay(language, period.start)),
    rows: [{ label: stats.flowCreated, value: core.count(period.created, "task"), shape: "bar", color: CREATED }],
  }));
}

export function IntakePanel({ weeks, days, windows }: { weeks: FlowPeriod[]; days: FlowPeriod[]; windows: GrainPeriods }) {
  const { stats, core } = useMessages();
  const language = useLanguage();
  const { grain, periods, period, toggle } = useGrainPanel("intake", "day", { weeks, days }, windows);
  const tooltip = useMemo(() => periodTooltip(stats, core, language, grain), [stats, core, language, grain]);
  const legend: LegendItem[] = [{ label: stats.createdTasks, shape: "bar", color: CREATED }];
  const title = stats.createdBy[grain];
  return (
    <Panel title={title} period={period} aside={toggle}>
      <ChartFrame summary={stats.intakeSummary(summarizeIntake(grain, periods))} legend={legend}>
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
