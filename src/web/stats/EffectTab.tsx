import { useParams } from "react-router";
import type { EffectReport } from "../../core/api/contract";
import { useStatsReport } from "../app/queries";
import { useMessages } from "../i18n";
import { EffectExplainer } from "./EffectExplainer";
import { EffectChartPanel, EffectFigures, ProjectsPanel } from "./EffectPanels";
import { StatsTabState } from "./StatsTabState";
import { UnavailableRepos } from "./UnavailableRepos";
import layout from "./StatsLayout.module.css";

export function EffectTab() {
  const { projectId } = useParams();
  const effect = useStatsReport("effect", projectId);
  return <StatsTabState query={effect}>{(report) => <Effect report={report} />}</StatsTabState>;
}

function Effect({ report }: { report: EffectReport }) {
  const { stats } = useMessages();
  const nothingDeferred = report.totals.deferredTasks === 0;
  return (
    <>
      <UnavailableRepos repos={report.unavailableRepos} />
      {nothingDeferred && <p className={layout.note}>{stats.noDeferredTasks}</p>}
      <EffectFigures totals={report.totals} period={report.periods.weeks} />
      <div className={layout.blocks}>
        <div className={layout.wide}>
          <EffectChartPanel weeks={report.weeks} days={report.days} windows={report.periods} totals={report.totals} />
        </div>
        <div className={layout.wide}>
          <ProjectsPanel projects={report.projects} period={report.periods.weeks} />
        </div>
        <div className={layout.wide}>
          <EffectExplainer totals={report.totals} />
        </div>
      </div>
    </>
  );
}
