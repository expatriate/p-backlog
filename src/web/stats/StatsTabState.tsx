import type { ReactNode } from "react";
import { ApiError } from "../api/client";
import { formatDate } from "../labels";
import { Button } from "../ui/Button";
import { cx } from "../ui/cx";
import styles from "./StatsPage.module.css";

type JournalFacts = { taskCount: number; journalSince: string | null; invalidJournalLines: number };

export function StatsRequestState({
  error,
  loaded,
  isFetching,
  onRetry,
  emptyMessage = null,
  children,
}: {
  error: unknown;
  loaded: boolean;
  isFetching: boolean;
  onRetry: () => void;
  emptyMessage?: string | null;
  children: ReactNode;
}) {
  const notFound = error instanceof ApiError && error.status === 404;
  const isLoading = error === null && !loaded;
  const message = statusMessage(error, notFound, loaded, emptyMessage);

  return (
    <>
      <div role="status" aria-live="polite" className={message === null ? "visually-hidden" : cx(styles.hint, isLoading && styles.hintLoading)}>
        {message !== null && <p>{message}</p>}
        {error !== null && !notFound && (
          <Button onClick={onRetry} disabled={isFetching}>
            Повторить
          </Button>
        )}
      </div>
      {error === null && loaded && emptyMessage === null && <div className={styles.content}>{children}</div>}
    </>
  );
}

export function StatsTabState({
  error,
  data,
  isFetching,
  onRetry,
  children,
}: {
  error: unknown;
  data: JournalFacts | undefined;
  isFetching: boolean;
  onRetry: () => void;
  children: ReactNode;
}) {
  return (
    <StatsRequestState
      error={error}
      loaded={data !== undefined}
      isFetching={isFetching}
      onRetry={onRetry}
      emptyMessage={data !== undefined && data.taskCount === 0 ? "Задач пока нет." : null}
    >
      {data !== undefined && (
        <>
          {data.invalidJournalLines > 0 && (
            <p className={styles.warning} role="status">
              Не удалось разобрать строк журнала: {data.invalidJournalLines}. Они не входят в статистику — проверьте формат строк в journal.jsonl проекта.
            </p>
          )}
          {children}
          <p className={styles.note}>{journalNote(data.journalSince)}</p>
        </>
      )}
    </StatsRequestState>
  );
}

function statusMessage(error: unknown, notFound: boolean, loaded: boolean, emptyMessage: string | null): string | null {
  if (error !== null) return notFound ? "Проект не найден." : "Сервер беклога не отвечает.";
  if (!loaded) return "Считаем статистику…";
  return emptyMessage;
}

function journalNote(since: string | null): string {
  if (since === null) return "Журнал ещё пуст; всё построено по датам в файлах задач.";
  return `Журнал ведётся с ${formatDate(since)}; раньше — по датам в файлах задач. Удалённые до этого задачи в статистику не попали.`;
}
