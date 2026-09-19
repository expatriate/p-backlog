import { useParams } from "react-router";
import type { EffectReport } from "../../core/stats/types";
import { useEffectStats } from "../app/queries";
import { EffectChartPanel, EffectFigures, ProjectsPanel } from "./EffectPanels";
import flowStyles from "./FlowPanels.module.css";
import { StatsTabState } from "./StatsTabState";
import styles from "./StatsPage.module.css";

export function EffectTab() {
  const { projectId } = useParams();
  const effect = useEffectStats(projectId);
  return (
    <StatsTabState error={effect.error} data={effect.data} onRetry={() => void effect.refetch()}>
      {effect.data && <Effect report={effect.data} />}
    </StatsTabState>
  );
}

function Effect({ report }: { report: EffectReport }) {
  return (
    <>
      {report.unavailableRepos.map((repo) => (
        <p key={repo} className={styles.warning} role="status">
          Нет доступа к репозиторию: {repo}
        </p>
      ))}
      <EffectFigures totals={report.totals} />
      <div className={styles.blocks}>
        <div className={flowStyles.wide}>
          <EffectChartPanel weeks={report.weeks} totals={report.totals} />
        </div>
        <div className={flowStyles.wide}>
          <ProjectsPanel projects={report.projects} />
        </div>
      </div>
      <p className={styles.note}>
        Оценка: каждая задача беклога — правка, которая без него попала бы в пулреквест. Размер исправленных — по коммиту исправления, ожидающих — по медиане исправлений. Размер исправленных — весь
        коммит исправления; общий коммит делится между задачами.
      </p>
    </>
  );
}
