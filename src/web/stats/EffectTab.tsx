import { useParams } from "react-router";
import type { EffectReport } from "../../core/stats/types";
import { useEffectStats } from "../app/queries";
import { EffectExplainer } from "./EffectExplainer";
import { EffectChartPanel, EffectFigures, ProjectsPanel } from "./EffectPanels";
import rowStyles from "./PanelRows.module.css";
import { StatsTabState } from "./StatsTabState";
import styles from "./StatsPage.module.css";

export function EffectTab() {
  const { projectId } = useParams();
  const effect = useEffectStats(projectId);
  return (
    <StatsTabState error={effect.error} data={effect.data} isFetching={effect.isFetching} onRetry={() => void effect.refetch()}>
      {effect.data && <Effect report={effect.data} />}
    </StatsTabState>
  );
}

function Effect({ report }: { report: EffectReport }) {
  return (
    <>
      {report.unavailableRepos.map((repo) => (
        <p key={repo} className={styles.warning} role="status">
          Нет доступа к репозиторию: {repo}. Проверьте путь в repos файла project.md и что это git-репозиторий.
        </p>
      ))}
      <EffectFigures totals={report.totals} />
      <div className={styles.blocks}>
        <div className={rowStyles.wide}>
          <EffectChartPanel weeks={report.weeks} totals={report.totals} />
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
