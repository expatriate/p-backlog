import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useOutletContext } from "react-router";
import { formatDate } from "../../core/i18n/format";
import type { Language } from "../../core/i18n/language";
import type { ReportHead } from "../../core/api/contract";
import { ApiError } from "../api/client";
import { RequestFailure } from "../app/RequestFailure";
import { useLanguage, useMessages } from "../i18n";
import { useStatusFocus } from "../ui/use-status-focus";
import { cx } from "../ui/cx";
import type { StatsMessages } from "./messages.ru";
import type { StatsOutletContext } from "./StatsPage";
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
  const { stats } = useMessages();
  const { error, data, isFetching } = query;
  const loaded = data !== undefined;
  const notFound = error instanceof ApiError && error.status === 404;
  const failure = notFound ? null : error;
  const isLoading = error === null && !loaded;
  const message = statusMessage(stats, error, notFound, loaded, emptyMessage);
  const { status, keepFocus } = useStatusFocus(message === null && failure === null, useOutletContext<StatsOutletContext | undefined>()?.heading);

  const retry = () => {
    keepFocus();
    void query.refetch();
  };

  return (
    <>
      <div
        ref={status}
        tabIndex={-1}
        role="status"
        aria-live="polite"
        className={message === null && failure === null ? "visually-hidden" : cx(styles.hint, isLoading && styles.hintLoading)}
      >
        {message !== null && <p>{message}</p>}
        {failure !== null && <RequestFailure error={failure} fetching={isFetching} onRetry={retry} />}
      </div>
      {!notFound && data !== undefined && emptyMessage === null && <div className={styles.content}>{children(data)}</div>}
    </>
  );
}

export function StatsTabState<T extends ReportHead>({ query, children }: { query: ReportQuery<T>; children: (report: T) => ReactNode }) {
  const { stats } = useMessages();
  const language = useLanguage();
  const invalidLines = query.data?.invalidJournalLines ?? 0;
  const unknownLines = query.data?.unknownJournalLines ?? 0;
  const unparsedTasks = query.data?.unparsedTasks ?? 0;
  const warnings = [
    invalidLines > 0 ? stats.invalidJournalLines(invalidLines) : null,
    unknownLines > 0 ? stats.unknownJournalLines(unknownLines) : null,
    unparsedTasks > 0 ? stats.unparsedTasks(unparsedTasks) : null,
  ].filter((text) => text !== null);
  return (
    <>
      <p className={warnings.length > 0 ? styles.warning : "visually-hidden"} role="status">
        {warnings.join(" ")}
      </p>
      <StatsRequestState query={query} emptyMessage={query.data?.taskCount === 0 ? stats.noTasks : null}>
        {(report) => (
          <>
            {children(report)}
            <p className={styles.note}>{journalNote(stats, language, report.journalSince)}</p>
          </>
        )}
      </StatsRequestState>
    </>
  );
}

function statusMessage(stats: StatsMessages, error: Error | null, notFound: boolean, loaded: boolean, emptyMessage: string | null): string | null {
  if (notFound) return stats.projectNotFound;
  if (error !== null) return null;
  if (!loaded) return stats.loading;
  return emptyMessage;
}

function journalNote(stats: StatsMessages, language: Language, since: string | null): string {
  if (since === null) return stats.journalEmpty;
  return stats.journalSince(formatDate(language, since));
}
