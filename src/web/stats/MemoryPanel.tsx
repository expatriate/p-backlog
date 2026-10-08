import type { MemorySample } from "../../core/api/contract";
import { useMemorySamples } from "../app/queries";
import { useMessages } from "../i18n";
import { SampleChart } from "./charts/PeriodChart";
import type { SeriesEntry } from "./charts/series";
import { Panel } from "./Panel";
import rowStyles from "./PanelRows.module.css";
import { NO_VALUE } from "../labels";

const RSS = "var(--chart-line-bright)";
const HEAP = "var(--chart-line-blue)";

export function MemoryPanel() {
  const { stats } = useMessages();
  const series: SeriesEntry<MemorySample>[] = [
    { key: "rssMb", label: stats.processMemory, shape: "line", color: RSS, format: stats.megabytes },
    { key: "heapUsedMb", label: stats.jsHeap, shape: "dashed", color: HEAP, format: stats.megabytes },
  ];
  const memory = useMemorySamples();
  const samples = memory.data?.samples ?? [];
  const current = samples.at(-1)?.rssMb ?? null;
  const max = samples.length === 0 ? null : Math.max(...samples.map((sample) => sample.rssMb));
  const megabytes = (value: number | null) => (value === null ? NO_VALUE : stats.megabytes(value));
  return (
    <Panel title={stats.serverMemory}>
      <p className={rowStyles.muted}>{stats.memoryRestartNote}</p>
      <SampleChart name={stats.serverMemory} summary={stats.memorySummary(megabytes(current), megabytes(max))} data={samples} series={series} axes={{ left: { tickFormatter: stats.megabytes } }} />
    </Panel>
  );
}
