import { useParams } from "react-router";
import type { QualityReport } from "../../core/api/contract";
import { useStatsReport } from "../app/queries";
import { AccuracyPanel, CategoriesPanel, GraphPanel, OriginPanel } from "./QualityPanels";
import layout from "./StatsLayout.module.css";
import { StatsTabState } from "./StatsTabState";

export function QualityTab() {
  const { projectId } = useParams();
  const quality = useStatsReport("quality", projectId);
  return <StatsTabState query={quality}>{(report) => <Quality report={report} />}</StatsTabState>;
}

function Quality({ report }: { report: QualityReport }) {
  return (
    <div className={layout.blocks}>
      <div className={layout.wide}>
        <AccuracyPanel rows={report.accuracy} weeks={report.accuracyWeeks} days={report.accuracyDays} windows={report.periods} methodRows={report.methodAccuracy} matchRows={report.matchAccuracy} />
      </div>
      <div className={layout.wide}>
        <GraphPanel graph={report.graph} period={report.periods.weeks} />
      </div>
      <div className={layout.wide}>
        <CategoriesPanel rows={report.categories} period={report.periods.weeks} />
      </div>
      <div className={layout.wide}>
        <OriginPanel found={report.found} branches={report.branches} period={report.periods.weeks} />
      </div>
    </div>
  );
}
