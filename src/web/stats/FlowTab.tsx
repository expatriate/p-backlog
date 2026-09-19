import { useParams } from "react-router";
import type { FlowReport } from "../../core/stats/types";
import { useFlowStats } from "../app/queries";
import { ForecastPanel, NowPanel } from "./FlowPanels";
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
  return (
    <div className={styles.blocks}>
      <ForecastPanel forecast={report.forecast} />
      <NowPanel now={report.now} />
    </div>
  );
}
