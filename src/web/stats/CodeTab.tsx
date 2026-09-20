import { useParams } from "react-router";
import type { CodeReport } from "../../core/stats/types";
import { useCodeStats } from "../app/queries";
import { ChurnPanel, DensityPanel, FixesPanel } from "./CodePanels";
import rowStyles from "./PanelRows.module.css";
import { StatsTabState } from "./StatsTabState";
import styles from "./StatsPage.module.css";
import { CHURN_PERIOD } from "./periods";

export function CodeTab() {
  const { projectId } = useParams();
  const code = useCodeStats(projectId);
  return (
    <StatsTabState error={code.error} data={code.data} isFetching={code.isFetching} onRetry={() => void code.refetch()}>
      {code.data && <Code report={code.data} />}
    </StatsTabState>
  );
}

function Code({ report }: { report: CodeReport }) {
  return (
    <>
      {report.unavailableRepos.map((repo) => (
        <p key={repo} className={styles.warning} role="status">
          Нет доступа к репозиторию: {repo}. Проверьте путь в repos файла project.md и что это git-репозиторий.
        </p>
      ))}
      <div className={styles.blocks}>
        <div className={rowStyles.wide}>
          <ChurnPanel churn={report.churn} />
        </div>
        <DensityPanel density={report.density} />
        <FixesPanel fixes={report.fixes} />
      </div>
      <p className={styles.note}>Изменения — коммиты за {CHURN_PERIOD}; строки — на последнем коммите.</p>
    </>
  );
}
