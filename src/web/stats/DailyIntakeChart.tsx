import { useMemo } from "react";
import { Bar, CartesianGrid, ComposedChart, Tooltip, XAxis, YAxis } from "recharts";
import type { Language } from "../../core/i18n/language";
import type { CoreMessages } from "../../core/messages";
import type { DayFlow } from "../../core/stats/types";
import { sum } from "../../core/stats/numbers";
import { useLanguage, useMessages } from "../i18n";
import { ChartFrame, type LegendItem } from "./charts/ChartFrame";
import { axisDay, compactNumber, tooltipDay } from "./charts/chart-format";
import { AXIS_PROPS, BAR_RADIUS, CHART_MARGIN, DATE_AXIS_PROPS, TOOLTIP_PROPS, VALUE_AXIS_WIDTH } from "./charts/chart-style";
import { rowTooltip } from "./charts/ChartTooltip";
import type { StatsMessages } from "./messages.ru";
import { Panel } from "./Panel";

const CREATED = "var(--chart-bar-warm)";

function dayTooltip(stats: StatsMessages, core: CoreMessages, language: Language) {
  return rowTooltip((day: DayFlow) => ({
    title: tooltipDay(language, day.day),
    rows: [{ label: stats.flowCreated, value: core.count(day.created, "task"), shape: "bar", color: CREATED }],
  }));
}

export function DailyIntakePanel({ days }: { days: DayFlow[] }) {
  const { stats, core } = useMessages();
  const language = useLanguage();
  const tooltip = useMemo(() => dayTooltip(stats, core, language), [stats, core, language]);
  const legend: LegendItem[] = [{ label: stats.createdTasks, shape: "bar", color: CREATED }];
  return (
    <Panel title={stats.createdByDay}>
      <ChartFrame summary={stats.intakeSummary(days.length, sum(days.map((day) => day.created)))} legend={legend}>
        <ComposedChart data={days} margin={CHART_MARGIN} aria-label={stats.chartLabel(stats.createdByDay, "day")}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="day" tickFormatter={(day: string) => axisDay(language, day)} {...DATE_AXIS_PROPS} />
          <YAxis allowDecimals={false} tickFormatter={(value: number) => compactNumber(language, value)} width={VALUE_AXIS_WIDTH} {...AXIS_PROPS} />
          <Tooltip content={tooltip} {...TOOLTIP_PROPS} />
          <Bar dataKey="created" fill={CREATED} radius={BAR_RADIUS} isAnimationActive={false} />
        </ComposedChart>
      </ChartFrame>
    </Panel>
  );
}
