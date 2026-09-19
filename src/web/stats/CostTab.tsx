import { useParams } from "react-router";
import { ApiError } from "../api/client";
import type { CostReport } from "../../core/stats/types";
import { useCostStats } from "../app/queries";
import { Button } from "../ui/Button";
import { cx } from "../ui/cx";
import { CommandsPanel, CostFigures, ModelsPanel, RunsChartPanel, TokensChartPanel } from "./CostPanels";
import flowStyles from "./FlowPanels.module.css";
import { MemoryPanel } from "./MemoryChart";
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
          {cost.data.scan.bytesLeft > 0 && (
            <p className={styles.warning} role="status">
              Считаем расход по расшифровкам Claude Code: прочитано {cost.data.scan.filesDone} из {cost.data.scan.filesTotal} файлов
            </p>
          )}
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

function Cost({ report }: { report: CostReport }) {
  return (
    <>
      <CostFigures totals={report.totals} days={report.days} models={report.models} />
      <div className={styles.blocks}>
        <div className={flowStyles.wide}>
          <TokensChartPanel days={report.days} />
        </div>
        <div className={flowStyles.wide}>
          <RunsChartPanel days={report.days} />
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
