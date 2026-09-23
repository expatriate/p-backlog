import { useParams } from "react-router";
import type { CodeReport } from "../../core/stats/types";
import { useCodeStats } from "../app/queries";
import { ChurnPanel, DensityPanel } from "./CodePanels";
import rowStyles from "./PanelRows.module.css";
import { StatsTabState } from "./StatsTabState";
import { UnavailableRepos } from "./UnavailableRepos";
import styles from "./StatsPage.module.css";
import { CHURN_PERIOD } from "./periods";

export function CodeTab() {
  const { projectId } = useParams();
  const code = useCodeStats(projectId);
  return <StatsTabState query={code}>{(report) => <Code report={report} />}</StatsTabState>;
}

function Code({ report }: { report: CodeReport }) {
  return (
    <>
      <UnavailableRepos repos={report.unavailableRepos} />
      <div className={styles.blocks}>
        <div className={rowStyles.wide}>
          <ChurnPanel churn={report.churn} />
        </div>
        <DensityPanel density={report.density} />
      </div>
      <p className={styles.note}>Изменения — коммиты за {CHURN_PERIOD}; строки — на последнем коммите.</p>
    </>
  );
}
