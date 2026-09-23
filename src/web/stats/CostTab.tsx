import { useParams } from "react-router";
import type { CostReport, ScanProgress } from "../../core/stats/types";
import { pluralCount } from "../../core/stats/format";
import { useCostStats } from "../app/queries";
import { CommandsPanel, CostFigures, ModelsPanel } from "./CostPanels";
import rowStyles from "./PanelRows.module.css";
import { MemoryPanel } from "./MemoryChart";
import { SpendPanel } from "./SpendChart";
import styles from "./StatsPage.module.css";
import { StatsRequestState } from "./StatsTabState";

export function CostTab() {
  const { projectId } = useParams();
  const cost = useCostStats(projectId);

  return (
    <StatsRequestState error={cost.error} loaded={cost.data !== undefined} isFetching={cost.isFetching} onRetry={() => void cost.refetch()}>
      {cost.data && (
        <>
          <ScanNotice scan={cost.data.scan} />
          <Cost report={cost.data} />
          <p className={styles.note}>
            Токены из расшифровок Claude Code: ходы, запущенные Stop-хуком беклога, — точно; вывод команд backlog и скилла — оценка по длине текста. Деньги — по ценам Claude API, подписка может стоить
            иначе.
          </p>
        </>
      )}
    </StatsRequestState>
  );
}

function ScanNotice({ scan }: { scan: ScanProgress }) {
  const text = scanNoticeText(scan);
  return (
    <p className={text === null ? "visually-hidden" : styles.warning} role="status">
      {text}
    </p>
  );
}

function scanNoticeText(scan: ScanProgress): string | null {
  if (!scan.listed) return "Считаем расход по расшифровкам Claude Code…";
  if (scan.filesTotal === 0) return "Расшифровки Claude Code не найдены.";
  if (scan.bytesLeft > 0) return `Считаем расход по расшифровкам Claude Code: прочитано ${scan.filesDone} из ${pluralCount(scan.filesTotal, "файла", "файлов", "файлов")}`;
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
