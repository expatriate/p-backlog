import type { FlowPeriod, GrainPeriods } from "../../core/api/contract";
import { useLanguage, useMessages } from "../i18n";
import { compactNumber } from "./charts/chart-format";
import { PeriodChart } from "./charts/PeriodChart";
import type { SeriesEntry } from "./charts/series";
import { Panel } from "./Panel";
import { summarizeIntake } from "./summaries";
import { useGrainPanel } from "./use-grain-panel";

const CREATED = "var(--chart-bar-warm)";

export function IntakePanel({ weeks, days, windows }: { weeks: FlowPeriod[]; days: FlowPeriod[]; windows: GrainPeriods }) {
  const { stats, core } = useMessages();
  const language = useLanguage();
  const { grain, periods, period, toggle } = useGrainPanel("intake", "day", { weeks, days }, windows);
  const series: SeriesEntry<FlowPeriod>[] = [{ key: "created", label: stats.createdTasks, tooltipLabel: stats.flowCreated, shape: "bar", color: CREATED, format: (created) => core.count(created, "task") }];
  const title = stats.createdBy[grain];
  return (
    <Panel title={title} period={period} aside={toggle}>
      <PeriodChart
        name={title}
        grain={grain}
        summary={stats.intakeSummary(summarizeIntake(grain, periods))}
        data={periods}
        series={series}
        axes={{ left: { allowDecimals: false, tickFormatter: (value: number) => compactNumber(language, value) } }}
      />
    </Panel>
  );
}
