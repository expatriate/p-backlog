import { useParams } from "react-router";
import type { QualityReport } from "../../core/stats/types";
import { useQualityStats } from "../app/queries";
import { AccuracyPanel, CategoriesPanel, OriginPanel } from "./QualityPanels";
import rowStyles from "./PanelRows.module.css";
import styles from "./StatsPage.module.css";
import { StatsTabState } from "./StatsTabState";

export function QualityTab() {
  const { projectId } = useParams();
  const quality = useQualityStats(projectId);
  return <StatsTabState query={quality}>{(report) => <Quality report={report} />}</StatsTabState>;
}

function Quality({ report }: { report: QualityReport }) {
  return (
    <div className={styles.blocks}>
      <div className={rowStyles.wide}>
        <AccuracyPanel rows={report.accuracy} weeks={report.accuracyWeeks} symbolRows={report.symbolAccuracy} />
      </div>
      <div className={rowStyles.wide}>
        <CategoriesPanel rows={report.categories} />
      </div>
      <div className={rowStyles.wide}>
        <OriginPanel found={report.found} branches={report.branches} />
      </div>
    </div>
  );
}
