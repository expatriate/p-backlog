import { useParams } from "react-router";
import type { CodeReport } from "../../core/stats/types";
import { useCodeStats } from "../app/queries";
import { ChurnPanel, DensityPanel, FixesPanel } from "./CodePanels";
import flowStyles from "./FlowPanels.module.css";
import { StatsTabState } from "./StatsTabState";
import styles from "./StatsPage.module.css";

export function CodeTab() {
  const { projectId } = useParams();
  const code = useCodeStats(projectId);
  return (
    <StatsTabState error={code.error} data={code.data} onRetry={() => void code.refetch()}>
      {code.data && <Code report={code.data} />}
    </StatsTabState>
  );
}

function Code({ report }: { report: CodeReport }) {
  return (
    <>
      {report.unavailableRepos.map((repo) => (
        <p key={repo} className={styles.warning} role="status">
          Нет доступа к репозиторию: {repo}
        </p>
      ))}
      <div className={styles.blocks}>
        <div className={flowStyles.wide}>
          <ChurnPanel churn={report.churn} />
        </div>
        <DensityPanel density={report.density} />
        <FixesPanel fixes={report.fixes} />
      </div>
      <p className={styles.note}>Изменения — коммиты за 90 дней; строки — на последнем коммите.</p>
    </>
  );
}
