import type { FlowPeriod, GrainPeriods } from "../../core/api/contract";
import { useMessages } from "../i18n";
import { COUNT_AXIS } from "./charts/chart-style";
import { PeriodChart } from "./charts/PeriodChart";
import type { SeriesEntry } from "./charts/series";
import { Panel } from "./Panel";
import { summarizeIntake } from "./summaries";
import { useGrainPanel } from "./use-grain-panel";

const CREATED = "var(--chart-bar-warm)";

export function IntakePanel({ weeks, days, windows }: { weeks: FlowPeriod[]; days: FlowPeriod[]; windows: GrainPeriods }) {
  const { stats, core } = useMessages();
  const { grain, periods, period, toggle } = useGrainPanel("intake", "day", { weeks, days }, windows);
  const series: SeriesEntry<FlowPeriod>[] = [{ key: "created", label: stats.createdTasks, tooltipLabel: stats.flowCreated, shape: "bar", color: CREATED, format: (created) => core.count(created, "task") }];
  const title = stats.createdBy[grain];
  return (
    <Panel title={title} period={period} aside={toggle}>
      <PeriodChart name={title} grain={grain} summary={stats.intakeSummary(summarizeIntake(grain, periods))} data={periods} series={series} axes={{ left: COUNT_AXIS }} />
    </Panel>
  );
}
