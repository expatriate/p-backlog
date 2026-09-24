import { useParams } from "react-router";
import type { EffectReport } from "../../core/api/contract";
import { useEffectStats } from "../app/queries";
import { EffectExplainer } from "./EffectExplainer";
import { EffectChartPanel, EffectFigures, ProjectsPanel } from "./EffectPanels";
import rowStyles from "./PanelRows.module.css";
import { StatsTabState } from "./StatsTabState";
import { UnavailableRepos } from "./UnavailableRepos";
import styles from "./StatsPage.module.css";

export function EffectTab() {
  const { projectId } = useParams();
  const effect = useEffectStats(projectId);
  return <StatsTabState query={effect}>{(report) => <Effect report={report} />}</StatsTabState>;
}

function Effect({ report }: { report: EffectReport }) {
  return (
    <>
      <UnavailableRepos repos={report.unavailableRepos} />
      <EffectFigures totals={report.totals} />
      <div className={styles.blocks}>
        <div className={rowStyles.wide}>
          <EffectChartPanel weeks={report.weeks} days={report.days} totals={report.totals} />
        </div>
        <div className={rowStyles.wide}>
          <ProjectsPanel projects={report.projects} />
        </div>
        <div className={rowStyles.wide}>
          <EffectExplainer totals={report.totals} />
        </div>
      </div>
    </>
  );
}
