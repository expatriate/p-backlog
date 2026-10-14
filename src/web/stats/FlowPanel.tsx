import type { FlowPeriod, GrainPeriods } from "../../core/api/contract";
import { useLanguage, useMessages } from "../i18n";
import { COUNT_AXIS } from "./charts/chart-style";
import { PeriodChart } from "./charts/PeriodChart";
import type { SeriesEntry } from "./charts/series";
import { wholeFormatter } from "./value-format";
import { Panel } from "./Panel";
import { summarizeFlow } from "./summaries";
import { useGrainPanel } from "./use-grain-panel";

const CREATED = "var(--chart-bar-neutral)";
const CLOSED = "var(--chart-bar-green)";
const OPEN = "var(--chart-line-bright)";

export function FlowPanel({ weeks, days, windows }: { weeks: FlowPeriod[]; days: FlowPeriod[]; windows: GrainPeriods }) {
  const { stats } = useMessages();
  const language = useLanguage();
  const { grain, periods, period, toggle } = useGrainPanel("flow", "week", { weeks, days }, windows);
  const whole = wholeFormatter(language);
  const series: SeriesEntry<FlowPeriod>[] = [
    { key: "created", label: stats.flowCreated, shape: "bar", color: CREATED, format: whole },
    { key: "closed", label: stats.flowClosed, shape: "bar", color: CLOSED, format: whole },
    { key: "openAtEnd", label: stats.flowOpenAtEnd[grain], tooltipLabel: stats.flowOpen, shape: "line", color: OPEN, axis: "right", format: whole },
  ];
  const title = stats.debtBy[grain];
  return (
    <Panel title={title} period={period} aside={toggle}>
      <PeriodChart name={title} grain={grain} summary={stats.flowSummary(summarizeFlow(grain, periods))} data={periods} series={series} axes={{ left: COUNT_AXIS, right: COUNT_AXIS }} />
    </Panel>
  );
}
