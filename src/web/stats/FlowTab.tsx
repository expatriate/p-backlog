import { useMemo } from "react";
import { useParams } from "react-router";
import type { FlowReport } from "../../core/stats/types";
import { useFlowStats, useTasks } from "../app/queries";
import { epicTones } from "../ui/epic-tone";
import { CyclePanel, EpicsPanel, ForecastPanel, NowPanel, WipPanel } from "./FlowPanels";
import panelStyles from "./FlowPanels.module.css";
import { StatsTabState } from "./StatsTabState";
import styles from "./StatsPage.module.css";

export function FlowTab() {
  const { projectId } = useParams();
  const flow = useFlowStats(projectId);
  return (
    <StatsTabState error={flow.error} data={flow.data} onRetry={() => void flow.refetch()}>
      {flow.data && <Flow report={flow.data} />}
    </StatsTabState>
  );
}

function Flow({ report }: { report: FlowReport }) {
  const tasks = useTasks();
  const tones = useMemo(() => epicTones(tasks.data?.tasks ?? []), [tasks.data]);
  return (
    <div className={styles.blocks}>
      <ForecastPanel forecast={report.forecast} />
      <NowPanel now={report.now} />
      <CyclePanel cycle={report.cycle} />
      <WipPanel wip={report.wip} />
      <div className={panelStyles.wide}>
        <EpicsPanel epics={report.epics} tones={tones} />
      </div>
    </div>
  );
}
