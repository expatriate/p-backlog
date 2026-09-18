import { useEffect } from "react";
import { useParams } from "react-router";
import type { StatsReport, StatsTotals } from "../../core/stats/types";
import { ApiError } from "../api/client";
import { useProjects, useStats } from "../app/queries";
import { formatDate } from "../labels";
import { Button } from "../ui/Button";
import { cx } from "../ui/cx";
import { AgePanel } from "./AgePanel";
import { ClosingPanel } from "./ClosingPanel";
import { formatDays, formatSigned } from "./format";
import { HotspotsPanel } from "./HotspotsPanel";
import { Panel } from "./Panel";
import { WeeklyChart } from "./WeeklyChart";
import styles from "./StatsPage.module.css";

export function StatsPage() {
  const { projectId } = useParams();
  const projects = useProjects();
  const stats = useStats(projectId);
  const scopeName = projectId === undefined ? "Все проекты" : (projects.data?.find((project) => project.id === projectId)?.name ?? projectId);
  const title = `Статистика · ${scopeName}`;

  useEffect(() => {
    document.title = `${title} — Беклог`;
  }, [title]);

  return (
    <main className={styles.page}>
      <h1 className={styles.heading}>{title}</h1>
      {stats.isError ? (
        stats.error instanceof ApiError && stats.error.status === 404 ? (
          <p className={styles.hint}>Проект не найден.</p>
        ) : (
          <div className={styles.hint} role="status">
            <p>Сервер беклога не отвечает.</p>
            <Button onClick={() => void stats.refetch()}>Повторить</Button>
          </div>
        )
      ) : stats.isPending ? (
        <p className={styles.hint}>Считаем статистику…</p>
      ) : stats.data.taskCount === 0 ? (
        <p className={styles.hint}>Задач пока нет.</p>
      ) : (
        <StatsContent report={stats.data} listPath={projectId === undefined ? "/" : `/p/${projectId}`} />
      )}
    </main>
  );
}

function StatsContent({ report, listPath }: { report: StatsReport; listPath: string }) {
  return (
    <div className={styles.content}>
      {report.invalidJournalLines > 0 && (
        <p className={styles.warning} role="status">
          Не удалось разобрать строк журнала: {report.invalidJournalLines}
        </p>
      )}
      <Totals totals={report.totals} />
      <div className={styles.blocks}>
        <Panel title="Долг по неделям">
          <WeeklyChart weeks={report.weeks} />
        </Panel>
        <HotspotsPanel hotspots={report.hotspots} listPath={listPath} />
        <AgePanel age={report.age} />
        <ClosingPanel closing={report.closing} />
      </div>
      <p className={styles.note}>{journalNote(report.journalSince)}</p>
    </div>
  );
}

function Totals({ totals }: { totals: StatsTotals }) {
  const net = totals.createdLastWeek - totals.closedLastWeek;
  return (
    <div className={styles.totals}>
      <Figure label="Открыто" value={String(totals.open)} note={`вес ${totals.openWeight}`} />
      <Figure label="За неделю" value={formatSigned(net)} tone={netTone(net)} note={`создано ${totals.createdLastWeek}, закрыто ${totals.closedLastWeek}`} />
      <Figure label="Возраст, медиана" value={formatDays(totals.ageMedianDays)} note={`старше 30 дн.: ${totals.olderThan30Days}`} />
      <Figure
        label="До закрытия, медиана"
        value={formatDays(totals.leadTimeMedianDays)}
        note={totals.leadTimeP90Days === null ? "закрытий нет" : `90% — за ${formatDays(totals.leadTimeP90Days)}`}
      />
    </div>
  );
}

function Figure({ label, value, note, tone }: { label: string; value: string; note: string; tone?: "growth" | "decline" }) {
  return (
    <div className={styles.figure} role="group" aria-label={label}>
      <span className={styles.figureLabel}>{label}</span>
      <span className={cx(styles.figureValue, tone === "growth" && styles.growth, tone === "decline" && styles.decline)}>{value}</span>
      <span className={styles.figureNote}>{note}</span>
    </div>
  );
}

function netTone(net: number): "growth" | "decline" | undefined {
  if (net > 0) return "growth";
  if (net < 0) return "decline";
  return undefined;
}

function journalNote(since: string | null): string {
  if (since === null) return "Журнал ещё пуст; всё построено по датам в файлах задач.";
  return `Журнал ведётся с ${formatDate(since)}; раньше — по датам в файлах задач. Удалённые до этого задачи в статистику не попали.`;
}
