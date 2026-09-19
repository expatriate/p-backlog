import type { ReactNode } from "react";
import { ApiError } from "../api/client";
import { formatDate } from "../labels";
import { Button } from "../ui/Button";
import styles from "./StatsPage.module.css";

type JournalFacts = { taskCount: number; journalSince: string | null; invalidJournalLines: number };

export function StatsTabState({ error, data, onRetry, children }: { error: unknown; data: JournalFacts | undefined; onRetry: () => void; children: ReactNode }) {
  if (error !== null) return <StatsError error={error} onRetry={onRetry} />;
  if (data === undefined) return <p className={styles.hint}>Считаем статистику…</p>;
  if (data.taskCount === 0) return <p className={styles.hint}>Задач пока нет.</p>;
  return (
    <div className={styles.content}>
      {data.invalidJournalLines > 0 && (
        <p className={styles.warning} role="status">
          Не удалось разобрать строк журнала: {data.invalidJournalLines}
        </p>
      )}
      {children}
      <p className={styles.note}>{journalNote(data.journalSince)}</p>
    </div>
  );
}

function StatsError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  if (error instanceof ApiError && error.status === 404) {
    return <p className={styles.hint}>Проект не найден.</p>;
  }
  return (
    <div className={styles.hint} role="status">
      <p>Сервер беклога не отвечает.</p>
      <Button onClick={onRetry}>Повторить</Button>
    </div>
  );
}

function journalNote(since: string | null): string {
  if (since === null) return "Журнал ещё пуст; всё построено по датам в файлах задач.";
  return `Журнал ведётся с ${formatDate(since)}; раньше — по датам в файлах задач. Удалённые до этого задачи в статистику не попали.`;
}
