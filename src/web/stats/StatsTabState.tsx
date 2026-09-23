import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { ReportHead } from "../../core/stats/types";
import { ApiError } from "../api/client";
import { formatDate } from "../labels";
import { Button } from "../ui/Button";
import { cx } from "../ui/cx";
import styles from "./StatsPage.module.css";

type ReportQuery<T> = Pick<UseQueryResult<T>, "error" | "data" | "isFetching" | "refetch">;

export function StatsRequestState<T>({
  query,
  emptyMessage = null,
  children,
}: {
  query: ReportQuery<T>;
  emptyMessage?: string | null;
  children: (report: T) => ReactNode;
}) {
  const { error, data, isFetching } = query;
  const loaded = data !== undefined;
  const notFound = error instanceof ApiError && error.status === 404;
  const isLoading = error === null && !loaded;
  const message = statusMessage(error, notFound, loaded, emptyMessage);

  return (
    <>
      <div role="status" aria-live="polite" className={message === null ? "visually-hidden" : cx(styles.hint, isLoading && styles.hintLoading)}>
        {message !== null && <p>{message}</p>}
        {error !== null && !notFound && (
          <Button onClick={() => void query.refetch()} disabled={isFetching}>
            Повторить
          </Button>
        )}
      </div>
      {error === null && data !== undefined && emptyMessage === null && <div className={styles.content}>{children(data)}</div>}
    </>
  );
}

export function StatsTabState<T extends ReportHead>({ query, children }: { query: ReportQuery<T>; children: (report: T) => ReactNode }) {
  return (
    <StatsRequestState query={query} emptyMessage={query.data?.taskCount === 0 ? "Задач пока нет." : null}>
      {(report) => (
        <>
          {report.invalidJournalLines > 0 && (
            <p className={styles.warning} role="status">
              Не удалось разобрать строк журнала: {report.invalidJournalLines}. Они не входят в статистику — проверьте формат строк в journal.jsonl проекта.
            </p>
          )}
          {children(report)}
          <p className={styles.note}>{journalNote(report.journalSince)}</p>
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
