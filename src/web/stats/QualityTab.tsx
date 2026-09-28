import { useParams } from "react-router";
import type { QualityReport } from "../../core/api/contract";
import { useStatsReport } from "../app/queries";
import { AccuracyPanel, CategoriesPanel, GraphPanel, OriginPanel } from "./QualityPanels";
import rowStyles from "./PanelRows.module.css";
import styles from "./StatsPage.module.css";
import { StatsTabState } from "./StatsTabState";

export function QualityTab() {
  const { projectId } = useParams();
  const quality = useStatsReport("quality", projectId);
  return <StatsTabState query={quality}>{(report) => <Quality report={report} />}</StatsTabState>;
}

function Quality({ report }: { report: QualityReport }) {
  return (
    <div className={styles.blocks}>
      <div className={rowStyles.wide}>
        <AccuracyPanel rows={report.accuracy} weeks={report.accuracyWeeks} days={report.accuracyDays} windows={report.periods} methodRows={report.methodAccuracy} matchRows={report.matchAccuracy} />
      </div>
      <div className={rowStyles.wide}>
        <GraphPanel graph={report.graph} period={report.periods.weeks} />
      </div>
      <div className={rowStyles.wide}>
        <CategoriesPanel rows={report.categories} period={report.periods.weeks} />
      </div>
      <div className={rowStyles.wide}>
        <OriginPanel found={report.found} branches={report.branches} period={report.periods.weeks} />
      </div>
    </div>
  );
}
