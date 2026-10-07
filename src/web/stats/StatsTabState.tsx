import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useOutletContext } from "react-router";
import { formatDate } from "../../core/i18n/format";
import type { Language } from "../../core/i18n/language";
import type { ReportHead } from "../../core/api/contract";
import { isNotFound } from "../api/client";
import { RequestFailure } from "../app/RequestFailure";
import { useLanguage, useMessages } from "../i18n";
import { useStatusFocus } from "../ui/use-status-focus";
import { cx } from "../ui/cx";
import type { StatsMessages } from "./messages.ru";
import type { StatsOutletContext } from "./StatsPage";
import styles from "./StatsPage.module.css";

type ReportQuery<T> = Pick<UseQueryResult<T>, "error" | "data" | "isFetching" | "refetch">;

type EmptyReport<T> = { isEmpty: (report: T) => boolean; message: string };

type RequestView<T> = { kind: "notFound" } | { kind: "loading" } | { kind: "failed"; error: Error; report: T | undefined } | { kind: "empty"; message: string } | { kind: "ready"; report: T };

export function StatsRequestState<T>({ query, empty, children }: { query: ReportQuery<T>; empty?: EmptyReport<T> | undefined; children: (report: T) => ReactNode }) {
  const { stats } = useMessages();
  const view = requestView(query, empty);
  const message = statusMessage(stats, view);
  const failure = view.kind === "failed" ? view.error : null;
  const report = view.kind === "ready" || view.kind === "failed" ? view.report : undefined;
  const settled = view.kind === "ready";
  const { status, keepFocus } = useStatusFocus(settled, useOutletContext<StatsOutletContext | undefined>()?.heading);

  const retry = () => {
    keepFocus();
    void query.refetch();
  };

  return (
    <>
      <div ref={status} tabIndex={-1} role="status" aria-live="polite" className={settled ? "visually-hidden" : cx(styles.hint, view.kind === "loading" && styles.hintLoading)}>
        {message !== null && <p>{message}</p>}
        {failure !== null && <RequestFailure error={failure} fetching={query.isFetching} onRetry={retry} />}
      </div>
      {report !== undefined && <div className={styles.content}>{children(report)}</div>}
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
      <StatsRequestState query={query} empty={{ isEmpty: (report) => report.taskCount === 0, message: stats.noTasks }}>
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

function requestView<T>({ error, data }: ReportQuery<T>, empty: EmptyReport<T> | undefined): RequestView<T> {
  if (isNotFound(error)) return { kind: "notFound" };
  const shown = data !== undefined && empty?.isEmpty(data) !== true ? data : undefined;
  if (error !== null) return { kind: "failed", error, report: shown };
  if (data === undefined) return { kind: "loading" };
  if (shown === undefined && empty !== undefined) return { kind: "empty", message: empty.message };
  return { kind: "ready", report: data };
}

function statusMessage(stats: StatsMessages, view: RequestView<unknown>): string | null {
  switch (view.kind) {
    case "notFound":
      return stats.projectNotFound;
    case "loading":
      return stats.loading;
    case "empty":
      return view.message;
    case "failed":
    case "ready":
      return null;
  }
}

function journalNote(stats: StatsMessages, language: Language, since: string | null): string {
  if (since === null) return stats.journalEmpty;
  return stats.journalSince(formatDate(language, since));
}
