import { useParams } from "react-router";
import type { CodeReport } from "../../core/api/contract";
import { useStatsReport } from "../app/queries";
import { useMessages } from "../i18n";
import { ChurnPanel, DensityPanel } from "./CodePanels";
import { StatsTabState } from "./StatsTabState";
import { UnavailableRepos } from "./UnavailableRepos";
import layout from "./StatsLayout.module.css";

export function CodeTab() {
  const { projectId } = useParams();
  const code = useStatsReport("code", projectId);
  return <StatsTabState query={code}>{(report) => <Code report={report} />}</StatsTabState>;
}

function Code({ report }: { report: CodeReport }) {
  const { stats } = useMessages();
  return (
    <>
      <UnavailableRepos repos={report.unavailableRepos} />
      <div className={layout.blocks}>
        <div className={layout.wide}>
          <ChurnPanel churn={report.churn} period={report.periods.churn} />
        </div>
        <DensityPanel density={report.density} />
      </div>
      <p className={layout.note}>{stats.codeNote}</p>
    </>
  );
}
