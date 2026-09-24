import { useParams } from "react-router";
import type { QualityReport } from "../../core/api/contract";
import { useQualityStats } from "../app/queries";
import { AccuracyPanel, CategoriesPanel, GraphPanel, OriginPanel } from "./QualityPanels";
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
        <AccuracyPanel rows={report.accuracy} weeks={report.accuracyWeeks} methodRows={report.methodAccuracy} matchRows={report.matchAccuracy} />
      </div>
      <div className={rowStyles.wide}>
        <GraphPanel graph={report.graph} />
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
