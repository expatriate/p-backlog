import { useEffect, useRef, useState, type FocusEvent } from "react";
import { Link } from "react-router";
import type { BatchOutcome, BatchRequest, BatchResponse } from "../../core/api/contract";
import { PartialBatchError } from "../app/batch-chunks";
import { useBatchTasks } from "../app/queries";
import { ActionFailure } from "../app/RequestFailure";
import { useMessages } from "../i18n";
import { Button } from "../ui/Button";
import { focusDropped } from "../ui/focus-dropped";
import { useTaskHref } from "../app/use-task-href";
import { failureOf, isUndoResult, type BatchFailure, type BatchResult } from "./use-batch-result";
import footer from "./FooterPanel.module.css";
import styles from "./BatchNotice.module.css";

const NOTICE_LIFETIME_MS = 15_000;

type DoneOutcome = Extract<BatchOutcome, { outcome: "done" }>;
type SkippedOutcome = Extract<BatchOutcome, { outcome: "skipped" }>;

type UndoStep = { request: BatchRequest; undoneSoFar: BatchResult };
type NoticeState = { kind: "firstRun" | "undo"; nextUndo: UndoStep | undefined };

type BatchNoticeProps = {
  result: BatchResult | null;
  noticeId: number;
  onResult: (result: BatchResult | null) => void;
};

export function BatchNotice({ result, noticeId, onResult }: BatchNoticeProps) {
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
    if (result !== null && focusDropped()) (undoButton.current ?? summary.current)?.focus();
  }, [result]);

  const leave = (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setFocusInside(false);
  };

  if (result === null) return <div role="status" />;

  const done = result.response.results.filter((outcome): outcome is DoneOutcome => outcome.outcome === "done");
  const skipped = result.response.results.filter((outcome): outcome is SkippedOutcome => outcome.outcome === "skipped");
  const { kind, nextUndo } = noticeStateOf(result, done);

  const runUndo = () => {
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

  return (
    <div role="status" className={footer.panel} onFocus={() => setFocusInside(true)} onBlur={leave}>
      <p key={noticeId} ref={summary} tabIndex={-1} className={footer.headline}>
        {list.batchSummary[result.request.action.kind](done.length, result.request.tasks.length)}
      </p>
      {skipped.length > 0 && <SkippedTasks skipped={skipped} />}
      {nextUndo !== undefined && (
        <Button ref={undoButton} busy={isPending} onClick={runUndo}>
          {list.undo}
        </Button>
      )}
      {undo.error === null && result.failure !== undefined && (
        <ActionFailure className={footer.error} action={kind === "undo" ? list.undoFailed : list.notChanged(result.failure.rest.tasks.length)} error={result.failure.error} />
      )}
      {!(undo.error instanceof PartialBatchError) && <ActionFailure className={footer.error} action={list.undoFailed} error={undo.error} />}
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

function noticeStateOf(result: BatchResult, done: readonly DoneOutcome[]): NoticeState {
  if (isUndoResult(result)) {
    const rest = result.failure?.rest;
    return { kind: "undo", nextUndo: rest && { request: rest, undoneSoFar: result } };
  }
  if (done.length === 0) return { kind: "firstRun", nextUndo: undefined };
  const request = restoreRequestFor(done);
  return { kind: "firstRun", nextUndo: { request, undoneSoFar: { request, response: { results: [] } } } };
}

function restoreRequestFor(done: readonly DoneOutcome[]): BatchRequest {
  return {
    tasks: done.map(({ id, version }) => ({ id, version })),
    action: { kind: "restore", changes: Object.fromEntries(done.map(({ id, previous }) => [id, previous])) },
  };
}
