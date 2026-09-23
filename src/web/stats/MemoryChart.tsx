import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import type { Language } from "../../core/i18n/language";
import type { MemorySample } from "../../core/stats/types";
import { useMemorySamples } from "../app/queries";
import { useLanguage, useMessages } from "../i18n";
import { ChartFrame, type LegendItem } from "./charts/ChartFrame";
import { axisTime, tooltipTime } from "./charts/chart-format";
import { AXIS_PROPS, DASHED_LINE_WIDTH, LINE_WIDTH, DASHED_LINE, CHART_MARGIN, DATE_AXIS_PROPS, TOOLTIP_PROPS, VALUE_AXIS_WIDTH } from "./charts/chart-style";
import { rowTooltip } from "./charts/ChartTooltip";
import type { StatsMessages } from "./messages.ru";
import { Panel } from "./Panel";
import styles from "./MemoryChart.module.css";

const RSS = "var(--chart-line-bright)";
const HEAP = "var(--chart-line-blue)";

function sampleTooltip(stats: StatsMessages, language: Language) {
  return rowTooltip((sample: MemorySample) => ({
    title: tooltipTime(language, sample.at),
    rows: [
      { label: stats.processMemory, value: stats.megabytes(sample.rssMb), shape: "line", color: RSS },
      { label: stats.jsHeap, value: stats.megabytes(sample.heapUsedMb), shape: "dashed", color: HEAP },
    ],
  }));
}

export function MemoryPanel() {
  const { stats } = useMessages();
  const language = useLanguage();
  const tooltip = useMemo(() => sampleTooltip(stats, language), [stats, language]);
  const legend: LegendItem[] = [
    { label: stats.processMemory, shape: "line", color: RSS },
    { label: stats.jsHeap, shape: "dashed", color: HEAP },
  ];
  const memory = useMemorySamples();
  const samples = memory.data?.samples ?? [];
  const current = samples.at(-1)?.rssMb ?? null;
  const max = samples.length === 0 ? null : Math.max(...samples.map((sample) => sample.rssMb));
  return (
    <Panel title={stats.serverMemory}>
      <p className={styles.muted}>{stats.memoryRestartNote}</p>
      <ChartFrame summary={stats.memorySummary(stats.megabytes(current), stats.megabytes(max))} legend={legend}>
        <AreaChart data={samples} margin={CHART_MARGIN} aria-label={stats.chartLabel(stats.serverMemory, "sample")}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="at" tickFormatter={(at: string) => axisTime(language, at)} {...DATE_AXIS_PROPS} />
          <YAxis tickFormatter={(value: number) => stats.megabytes(value)} width={VALUE_AXIS_WIDTH} {...AXIS_PROPS} />
          <Tooltip content={tooltip} {...TOOLTIP_PROPS} cursor={{ stroke: "var(--line-strong)" }} />
          <Area dataKey="rssMb" stroke={RSS} strokeWidth={LINE_WIDTH} fill={RSS} fillOpacity={0.12} dot={false} isAnimationActive={false} />
          <Area dataKey="heapUsedMb" stroke={HEAP} strokeWidth={DASHED_LINE_WIDTH} strokeDasharray={DASHED_LINE} fill="none" dot={false} isAnimationActive={false} />
        </AreaChart>
      </ChartFrame>
    </Panel>
  );
}
