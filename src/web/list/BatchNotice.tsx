import { useEffect, useRef, useState, type FocusEvent } from "react";
import { Link } from "react-router";
import type { BatchOutcome, BatchRequest, BatchResponse } from "../../core/api/contract";
import { PartialBatchError } from "../app/batch-chunks";
import { useBatchTasks } from "../app/queries";
import { ActionFailure } from "../app/RequestFailure";
import { useMessages } from "../i18n";
import { Button } from "../ui/Button";
import type { TaskHref } from "../task/TaskRefs";
import { failureOf, isUndoResult, type BatchFailure, type BatchResult } from "./use-batch-result";
import footer from "./FooterPanel.module.css";
import styles from "./BatchNotice.module.css";

const NOTICE_LIFETIME_MS = 15_000;

type DoneOutcome = Extract<BatchOutcome, { outcome: "done" }>;
type SkippedOutcome = Extract<BatchOutcome, { outcome: "skipped" }>;

type BatchNoticeProps = {
  result: BatchResult | null;
  serial: number;
  onResult: (result: BatchResult | null) => void;
  taskHref: TaskHref;
};

export function BatchNotice({ result, serial, onResult, taskHref }: BatchNoticeProps) {
  const { list } = useMessages();
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
    const base: BatchResult = isUndoResult(result) ? result : { request: undoRequest, response: { results: [] } };
    const settle = (response: BatchResponse, failure?: BatchFailure) =>
      onResult({ request: base.request, response: { results: [...base.response.results, ...response.results] }, ...(failure && { failure }) });
    undo.mutate(undoRequest, {
      onSuccess: (response) => settle(response),
      onError: (error) => {
        if (error instanceof PartialBatchError) settle(error.done, failureOf(error));
      },
    });
  };

  return (
    <div role="status" className={result === null ? undefined : footer.panel} onFocus={() => setFocusInside(true)} onBlur={leave}>
      {result !== null && (
        <>
          <p key={serial} ref={summary} tabIndex={-1} className={footer.headline}>
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
            <ActionFailure
              className={footer.error}
              action={isUndoResult(result) ? list.undoFailed : list.notChanged(result.failure.rest.tasks.length)}
              error={result.failure.error}
            />
          )}
          {!(undo.error instanceof PartialBatchError) && <ActionFailure className={footer.error} action={list.undoFailed} error={undo.error} />}
        </>
      )}
    </div>
  );
}

function nextUndoRequest(result: BatchResult, done: readonly DoneOutcome[]): BatchRequest | undefined {
  if (isUndoResult(result)) return result.failure?.rest;
  return done.length > 0 ? restoreRequestFor(done) : undefined;
}

function restoreRequestFor(done: readonly DoneOutcome[]): BatchRequest {
  return {
    tasks: done.map(({ id, version }) => ({ id, version })),
    action: { kind: "restore", changes: Object.fromEntries(done.map(({ id, previous }) => [id, previous])) },
  };
}
