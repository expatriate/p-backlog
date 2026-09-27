import { useParams } from "react-router";
import type { CostReport, ScanProgress } from "../../core/api/contract";
import { useCostStats } from "../app/queries";
import { formatDate } from "../../core/i18n/format";
import { useLanguage, useMessages } from "../i18n";
import { CommandsPanel, CostFigures, ModelsPanel } from "./CostPanels";
import rowStyles from "./PanelRows.module.css";
import { MemoryPanel } from "./MemoryChart";
import { SpendPanel } from "./SpendChart";
import styles from "./StatsPage.module.css";
import type { StatsMessages } from "./messages.ru";
import { StatsRequestState } from "./StatsTabState";
import { usePeriodCaption } from "./period-caption";

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
  const { stats } = useMessages();
  const language = useLanguage();
  const caption = usePeriodCaption();
  const since = dataStartInsideWindow(report);
  return (
    <>
      <p className={styles.note}>{caption("lastWeek", report.periods.totals)}</p>
      <CostFigures totals={report.totals} days={report.days} />
      {since !== null && <p className={styles.note}>{stats.costSince(formatDate(language, `${since}T00:00:00`))}</p>}
      <div className={styles.blocks}>
        <div className={rowStyles.wide}>
          <SpendPanel weeks={report.weeks} days={report.days} windows={report.periods} />
        </div>
        <ModelsPanel models={report.models} period={report.periods.days} />
        <MemoryPanel />
        <div className={rowStyles.wide}>
          <CommandsPanel commands={report.commands} period={report.periods.days} />
        </div>
      </div>
    </>
  );
}

function dataStartInsideWindow({ since, periods }: CostReport): string | null {
  return since !== null && since > periods.weeks.from.slice(0, 10) ? since : null;
}
