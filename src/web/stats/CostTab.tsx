import { useParams } from "react-router";
import type { CostReport, ScanProgress } from "../../core/stats/types";
import { useCostStats } from "../app/queries";
import { useMessages } from "../i18n";
import { CommandsPanel, CostFigures, ModelsPanel } from "./CostPanels";
import rowStyles from "./PanelRows.module.css";
import { MemoryPanel } from "./MemoryChart";
import { SpendPanel } from "./SpendChart";
import styles from "./StatsPage.module.css";
import type { StatsMessages } from "./messages.ru";
import { StatsRequestState } from "./StatsTabState";

export function CostTab() {
  const { projectId } = useParams();
  const cost = useCostStats(projectId);
  const { stats } = useMessages();

  return (
    <StatsRequestState query={cost}>
      {(report) => (
        <>
          <ScanNotice scan={report.scan} />
          <Cost report={report} />
          <p className={styles.note}>{stats.costNote}</p>
        </>
      )}
    </StatsRequestState>
  );
}

function ScanNotice({ scan }: { scan: ScanProgress }) {
  const { stats } = useMessages();
  const text = scanNoticeText(stats, scan);
  return (
    <p className={text === null ? "visually-hidden" : styles.warning} role="status">
      {text}
    </p>
  );
}

function scanNoticeText(stats: StatsMessages, scan: ScanProgress): string | null {
  if (!scan.listed) return stats.scanStarting;
  if (scan.filesTotal === 0) return stats.noTranscripts;
  if (scan.bytesLeft > 0) return stats.scanProgress(scan.filesDone, scan.filesTotal);
  return null;
}

function Cost({ report }: { report: CostReport }) {
  return (
    <>
      <CostFigures totals={report.totals} days={report.days} />
      <div className={styles.blocks}>
        <div className={rowStyles.wide}>
          <SpendPanel days={report.days} />
        </div>
        <ModelsPanel models={report.models} />
        <MemoryPanel />
        <div className={rowStyles.wide}>
          <CommandsPanel commands={report.commands} />
        </div>
      </div>
    </>
  );
}
