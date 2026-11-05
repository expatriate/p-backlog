import { useCallback, useEffect, useRef } from "react";
import { Link } from "react-router";
import type { BatchOutcome, BatchRequest, BatchResponse } from "../../core/api/contract";
import { PartialBatchError } from "../app/batch-chunks";
import { useBatchTasks } from "../app/queries";
import { ActionFailure } from "../app/RequestFailure";
import { useMessages } from "../i18n";
import type { ListMessages } from "./messages.ru";
import { Button } from "../ui/Button";
import { focusDropped } from "../ui/focus-dropped";
import { useTaskHref } from "../app/use-task-href";
import { failureOf, isUndoResult, type BatchFailure, type BatchResult } from "./use-batch-result";
import { useNoticeLifetime } from "./use-notice-lifetime";
import footer from "./FooterPanel.module.css";
import styles from "./BatchNotice.module.css";

type DoneOutcome = Extract<BatchOutcome, { outcome: "done" }>;
type SkippedOutcome = Extract<BatchOutcome, { outcome: "skipped" }>;

type UndoStep = { request: BatchRequest; undoneSoFar: BatchResult };
type NoticeState = { kind: "firstRun" | "undo"; nextUndo: UndoStep | undefined };
type NoticeView = NoticeState & { result: BatchResult; done: DoneOutcome[]; skipped: SkippedOutcome[] };

type BatchNoticeProps = {
  result: BatchResult | null;
  noticeId: number;
  onResult: (result: BatchResult | null) => void;
};

export function BatchNotice({ result, noticeId, onResult }: BatchNoticeProps) {
  const { list } = useMessages();
  const undo = useBatchTasks();
  const notice = useRef<HTMLDivElement>(null);
  const summary = useRef<HTMLParagraphElement>(null);
  const undoButton = useRef<HTMLButtonElement>(null);

  const { isPending, reset } = undo;
  useEffect(() => reset(), [result, reset]);
  const hide = useCallback(() => onResult(null), [onResult]);
  useNoticeLifetime(notice, { content: result, paused: isPending, expire: hide });
  useEffect(() => {
    if (result !== null && focusDropped()) (undoButton.current ?? summary.current)?.focus();
  }, [result]);

  const view = result && noticeViewOf(result);

  const runUndo = () => {
    const nextUndo = view?.nextUndo;
    if (isPending || nextUndo === undefined) return;
    const { request, undoneSoFar } = nextUndo;
    const settle = (response: BatchResponse, failure?: BatchFailure) =>
      onResult({ request: undoneSoFar.request, response: { results: [...undoneSoFar.response.results, ...response.results] }, ...(failure && { failure }) });
    undo.mutate(request, {
      onSuccess: (response) => settle(response),
      onError: (error) => {
        if (error instanceof PartialBatchError) settle(error.done, failureOf(error));
      },
    });
  };

  const failureNotice = view && failureNoticeOf(view, undo.error, list);

  return (
    <div ref={notice} className={view !== null ? footer.panel : "visually-hidden"}>
      <div role="status" className={footer.announcement}>
        {view !== null && (
          <>
            <p key={noticeId} ref={summary} tabIndex={-1} className={footer.headline}>
              {list.batchSummary[view.result.request.action.kind](view.done.length, view.result.request.tasks.length)}
            </p>
            {view.skipped.length > 0 && <SkippedTasks skipped={view.skipped} />}
            {view.nextUndo !== undefined && (
              <Button ref={undoButton} busy={isPending} onClick={runUndo}>
                {list.undo}
              </Button>
            )}
          </>
        )}
      </div>
      {failureNotice && <ActionFailure key={failureNotice.of} className={footer.error} action={failureNotice.action} error={failureNotice.error} />}
    </div>
  );
}

function SkippedTasks({ skipped }: { skipped: readonly SkippedOutcome[] }) {
  const taskHref = useTaskHref();
  return (
    <ul className={styles.skipped}>
      {skipped.map((outcome) => (
        <li key={outcome.id}>
          <Link to={taskHref(outcome.id)}>{outcome.message}</Link>
        </li>
      ))}
    </ul>
  );
}

function noticeViewOf(result: BatchResult): NoticeView {
  const done = result.response.results.filter((outcome): outcome is DoneOutcome => outcome.outcome === "done");
  const skipped = result.response.results.filter((outcome): outcome is SkippedOutcome => outcome.outcome === "skipped");
  return { result, done, skipped, ...noticeStateOf(result, done) };
}

function noticeStateOf(result: BatchResult, done: readonly DoneOutcome[]): NoticeState {
  if (isUndoResult(result)) {
    const rest = result.failure?.rest;
    return { kind: "undo", nextUndo: rest && { request: rest, undoneSoFar: result } };
  }
  if (done.length === 0) return { kind: "firstRun", nextUndo: undefined };
  const request = restoreRequestFor(done);
  return { kind: "firstRun", nextUndo: { request, undoneSoFar: { request, response: { results: [] } } } };
}

function failureNoticeOf({ result, kind }: NoticeView, undoError: Error | null, list: ListMessages): { of: "undo" | "batch"; action: string; error: Error } | null {
  if (undoError instanceof PartialBatchError) return null;
  if (undoError !== null) return { of: "undo", action: list.undoFailed, error: undoError };
  if (result.failure === undefined) return null;
  return { of: "batch", action: kind === "undo" ? list.undoFailed : list.notChanged(result.failure.rest.tasks.length), error: result.failure.error };
}

function restoreRequestFor(done: readonly DoneOutcome[]): BatchRequest {
  return {
    tasks: done.map(({ id, version }) => ({ id, version })),
    action: { kind: "restore", changes: Object.fromEntries(done.map(({ id, previous }) => [id, previous])) },
  };
}
