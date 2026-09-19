import { useParams } from "react-router";
import { ApiError } from "../api/client";
import type { CostReport, ScanProgress } from "../../core/stats/types";
import { pluralCount } from "../../core/stats/format";
import { useCostStats } from "../app/queries";
import { Button } from "../ui/Button";
import { cx } from "../ui/cx";
import { CommandsPanel, CostFigures, ModelsPanel } from "./CostPanels";
import flowStyles from "./FlowPanels.module.css";
import { MemoryPanel } from "./MemoryChart";
import { SpendPanel } from "./SpendChart";
import styles from "./StatsPage.module.css";

export function CostTab() {
  const { projectId } = useParams();
  const cost = useCostStats(projectId);
  const notFound = cost.error instanceof ApiError && cost.error.status === 404;
  const isLoading = cost.error === null && cost.data === undefined;
  const message = statusMessage(cost.error, notFound, cost.data);

  return (
    <>
      <div role="status" aria-live="polite" className={message === null ? "visually-hidden" : cx(styles.hint, isLoading && styles.hintLoading)}>
        {message !== null && <p>{message}</p>}
        {cost.error !== null && !notFound && (
          <Button onClick={() => void cost.refetch()} disabled={cost.isFetching}>
            Повторить
          </Button>
        )}
      </div>
      {cost.data && (
        <div className={styles.content}>
          <ScanNotice scan={cost.data.scan} />
          <Cost report={cost.data} />
          <p className={styles.note}>
            Токены из расшифровок Claude Code: ходы, запущенные Stop-хуком беклога, — точно; вывод команд backlog и скилла — оценка по длине текста. Деньги — по ценам Claude API, подписка может стоить
            иначе.
          </p>
        </div>
      )}
    </>
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
      <CostFigures totals={report.totals} days={report.days} models={report.models} />
      <div className={styles.blocks}>
        <div className={flowStyles.wide}>
          <SpendPanel days={report.days} />
        </div>
        <ModelsPanel models={report.models} />
        <MemoryPanel />
        <div className={flowStyles.wide}>
          <CommandsPanel commands={report.commands} />
        </div>
      </div>
    </>
  );
}

function statusMessage(error: unknown, notFound: boolean, data: CostReport | undefined): string | null {
  if (error !== null) return notFound ? "Проект не найден." : "Сервер беклога не отвечает.";
  if (data === undefined) return "Считаем статистику…";
  return null;
}
