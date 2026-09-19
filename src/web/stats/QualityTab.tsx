import { useParams } from "react-router";
import type { QualityReport } from "../../core/stats/types";
import { useQualityStats } from "../app/queries";
import { AccuracyPanel, CategoriesPanel, OriginPanel } from "./QualityPanels";
import styles from "./QualityPanels.module.css";
import { StatsTabState } from "./StatsTabState";

export function QualityTab() {
  const { projectId } = useParams();
  const quality = useQualityStats(projectId);
  return (
    <StatsTabState error={quality.error} data={quality.data} onRetry={() => void quality.refetch()}>
      {quality.data && <Quality report={quality.data} />}
    </StatsTabState>
  );
}

function Quality({ report }: { report: QualityReport }) {
  return (
    <div className={styles.stack}>
      <AccuracyPanel rows={report.accuracy} />
      <CategoriesPanel rows={report.categories} />
      <OriginPanel found={report.found} branches={report.branches} />
    </div>
  );
}
