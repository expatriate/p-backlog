import { useCallback, useEffect, useRef, useState, type FocusEvent } from "react";
import { Link } from "react-router";
import type { BatchOutcome, BatchRequest, BatchResponse } from "../../core/api/contract";
import { PartialBatchError, useBatchTasks } from "../app/queries";
import { requestErrorMessage } from "../app/RequestFailure";
import { useMessages } from "../i18n";
import { Button } from "../ui/Button";
import type { TaskHref } from "../task/TaskRefs";
import styles from "./BatchNotice.module.css";

const NOTICE_LIFETIME_MS = 15_000;

export type BatchResult = { request: BatchRequest; response: BatchResponse; failure?: { error: Error; rest: BatchRequest } };

type DoneOutcome = Extract<BatchOutcome, { outcome: "done" }>;
type SkippedOutcome = Extract<BatchOutcome, { outcome: "skipped" }>;

export function useBatchResult(scopeKey: string) {
  const [state, setState] = useState<{ scopeKey: string; result: BatchResult | null }>({ scopeKey, result: null });
  if (state.scopeKey !== scopeKey) setState({ scopeKey, result: null });
  const show = useCallback((result: BatchResult | null) => setState((current) => ({ ...current, result })), []);
  return [state.result, show] as const;
}

type BatchNoticeProps = {
  result: BatchResult | null;
  onResult: (result: BatchResult | null) => void;
  taskHref: TaskHref;
};

export function BatchNotice({ result, onResult, taskHref }: BatchNoticeProps) {
  const { list, app } = useMessages();
  const undo = useBatchTasks();
  const [focusInside, setFocusInside] = useState(false);
  const summary = useRef<HTMLParagraphElement>(null);
  const undoButton = useRef<HTMLButtonElement>(null);

  const { isPending, reset } = undo;
  useEffect(() => reset(), [result, reset]);
  useEffect(() => {
    if (result === null || focusInside || isPending) return;
    const timer = setTimeout(() => onResult(null), NOTICE_LIFETIME_MS);
    return () => clearTimeout(timer);
  }, [result, focusInside, isPending, onResult]);
  useEffect(() => {
    if (result !== null && document.activeElement === document.body) (undoButton.current ?? summary.current)?.focus();
  }, [result]);

  const leave = (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setFocusInside(false);
  };

  const done = result?.response.results.filter((outcome): outcome is DoneOutcome => outcome.outcome === "done") ?? [];
  const skipped = result?.response.results.filter((outcome): outcome is SkippedOutcome => outcome.outcome === "skipped") ?? [];
  const undoRequest = result === null ? undefined : nextUndoRequest(result, done);

  const runUndo = () => {
    if (isPending || result === null || undoRequest === undefined) return;
    const base: BatchResult = result.request.action.kind === "restore" ? result : { request: undoRequest, response: { results: [] } };
    const settle = (response: BatchResponse, failure?: BatchResult["failure"]) =>
      onResult({ request: base.request, response: { results: [...base.response.results, ...response.results] }, ...(failure && { failure }) });
    undo.mutate(undoRequest, {
      onSuccess: (response) => settle(response),
      onError: (error) => {
        if (error instanceof PartialBatchError) settle(error.done, { error: error.failure, rest: error.rest });
      },
    });
  };

  return (
    <div role="status" className={result === null ? undefined : styles.notice} onFocus={() => setFocusInside(true)} onBlur={leave}>
      {result !== null && (
        <>
          <p ref={summary} tabIndex={-1} className={styles.summary}>
            {list.batchSummary[result.request.action.kind](done.length, result.request.tasks.length)}
          </p>
          {skipped.length > 0 && (
            <ul className={styles.skipped}>
              {skipped.map((outcome) => (
                <li key={outcome.id}>
                  <Link to={taskHref(outcome.id)}>{outcome.message}</Link>
                </li>
              ))}
            </ul>
          )}
          {undoRequest !== undefined && (
            <Button ref={undoButton} busy={isPending} onClick={runUndo}>
              {list.undo}
            </Button>
          )}
          {undo.error === null && result.failure !== undefined && (
            <p className={styles.error} role="alert">
              {result.request.action.kind === "restore" ? list.undoFailed : list.notChanged(result.failure.rest.tasks.length)}:{" "}
              {requestErrorMessage(app, result.failure.error)}
            </p>
          )}
          {undo.error !== null && !(undo.error instanceof PartialBatchError) && (
            <p className={styles.error} role="alert">
              {list.undoFailed}: {requestErrorMessage(app, undo.error)}
            </p>
          )}
        </>
      )}
    </div>
  );
}

export function partialBatchResult(request: BatchRequest, error: Error): BatchResult | null {
  return error instanceof PartialBatchError ? { request, response: error.done, failure: { error: error.failure, rest: error.rest } } : null;
}

function nextUndoRequest(result: BatchResult, done: readonly DoneOutcome[]): BatchRequest | undefined {
  if (result.request.action.kind === "restore") return result.failure?.rest;
  return done.length > 0 ? restoreRequestFor(done) : undefined;
}

function restoreRequestFor(done: readonly DoneOutcome[]): BatchRequest {
  return {
    tasks: done.map(({ id, version }) => ({ id, version })),
    action: { kind: "restore", changes: Object.fromEntries(done.map(({ id, previous }) => [id, previous])) },
  };
}
