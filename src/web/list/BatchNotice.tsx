import { useCallback, useEffect, useRef, useState, type FocusEvent } from "react";
import { Link } from "react-router";
import type { BatchOutcome, BatchRequest, BatchResponse } from "../../core/api/contract";
import { useBatchTasks } from "../app/queries";
import { requestErrorMessage } from "../app/RequestFailure";
import { useMessages } from "../i18n";
import { Button } from "../ui/Button";
import type { TaskHref } from "../task/TaskRefs";
import styles from "./BatchNotice.module.css";

const NOTICE_LIFETIME_MS = 15_000;

export type BatchResult = { request: BatchRequest; response: BatchResponse };

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
  const undoable = result !== null && result.request.action.kind !== "restore" && done.length > 0;

  const runUndo = () => {
    if (isPending) return;
    const request = restoreRequestFor(done);
    undo.mutate(request, { onSuccess: (response) => onResult({ request, response }) });
  };

  return (
    <div role="status" className={result === null ? undefined : styles.notice} onFocus={() => setFocusInside(true)} onBlur={leave}>
      {result !== null && (
        <>
          <p ref={summary} tabIndex={-1} className={styles.summary}>
            {list.batchSummary[result.request.action.kind](done.length, result.response.results.length)}
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
          {undoable && (
            <Button ref={undoButton} busy={isPending} onClick={runUndo}>
              {list.undo}
            </Button>
          )}
          {undo.error !== null && (
            <p className={styles.error} role="alert">
              {list.undoFailed}: {requestErrorMessage(app, undo.error)}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function restoreRequestFor(done: readonly DoneOutcome[]): BatchRequest {
  return {
    tasks: done.map(({ id, version }) => ({ id, version })),
    action: { kind: "restore", changes: Object.fromEntries(done.map(({ id, previous }) => [id, previous])) },
  };
}
