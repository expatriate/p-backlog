import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import type { MemorySample } from "../../core/stats/types";
import { useMemorySamples } from "../app/queries";
import { ChartFrame, type LegendItem } from "./charts/ChartFrame";
import { axisTime, tooltipTime } from "./charts/chart-format";
import { AXIS_PROPS, DASHED_LINE_WIDTH, LINE_WIDTH, DASHED_LINE, CHART_MARGIN, chartLabel, DATE_AXIS_PROPS, TOOLTIP_PROPS, VALUE_AXIS_WIDTH } from "./charts/chart-style";
import { rowTooltip } from "./charts/ChartTooltip";
import { formatMb } from "./cost-format";
import { Panel } from "./Panel";
import styles from "./MemoryChart.module.css";

const RSS = "var(--chart-line-bright)";
const HEAP = "var(--chart-line-blue)";

const LEGEND: LegendItem[] = [
  { label: "память процесса", shape: "line", color: RSS },
  { label: "куча JavaScript", shape: "dashed", color: HEAP },
];

const sampleTooltip = rowTooltip((sample: MemorySample) => ({
  title: tooltipTime(sample.at),
  rows: [
    { label: "память процесса", value: formatMb(sample.rssMb), shape: "line", color: RSS },
    { label: "куча JavaScript", value: formatMb(sample.heapUsedMb), shape: "dashed", color: HEAP },
  ],
}));

export function MemoryPanel() {
  const memory = useMemorySamples();
  const samples = memory.data?.samples ?? [];
  const current = samples.at(-1)?.rssMb ?? null;
  const max = samples.length === 0 ? null : Math.max(...samples.map((sample) => sample.rssMb));
  return (
    <Panel title="Память сервера">
      <p className={styles.muted}>После перезапуска сервера история начинается заново</p>
      <ChartFrame summary={`Сейчас ${formatMb(current)}, максимум за час ${formatMb(max)}`} legend={LEGEND}>
        <AreaChart data={samples} margin={CHART_MARGIN} aria-label={chartLabel("Память сервера", "замерам")}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="at" tickFormatter={axisTime} {...DATE_AXIS_PROPS} />
          <YAxis tickFormatter={(value: number) => formatMb(value)} width={VALUE_AXIS_WIDTH} {...AXIS_PROPS} />
          <Tooltip content={sampleTooltip} {...TOOLTIP_PROPS} cursor={{ stroke: "var(--line-strong)" }} />
          <Area dataKey="rssMb" stroke={RSS} strokeWidth={LINE_WIDTH} fill={RSS} fillOpacity={0.12} dot={false} isAnimationActive={false} />
          <Area dataKey="heapUsedMb" stroke={HEAP} strokeWidth={DASHED_LINE_WIDTH} strokeDasharray={DASHED_LINE} fill="none" dot={false} isAnimationActive={false} />
        </AreaChart>
      </ChartFrame>
    </Panel>
  );
}
