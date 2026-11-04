import { useCallback, useRef, useState } from "react";
import { asError } from "../../../core/errors";
import type { Task, TaskStatus } from "../../../core/model/types";
import { useUpdateTask } from "../../app/queries";
import { shownStatusOf, type PendingMoves } from "./board-columns";

type BoardMove = { id: string; from: TaskStatus; to: TaskStatus };

type MoveFailure = { id: string; error: Error };

export function useBoardMove(tasks: readonly Task[]) {
  const update = useUpdateTask();
  const [pending, setPending] = useState<PendingMoves>(new Map());
  const [lastMove, setLastMove] = useState<BoardMove | null>(null);
  const [failure, setFailure] = useState<MoveFailure | null>(null);
  const [undoing, setUndoing] = useState(false);
  const latestMoveOf = useRef(new Map<string, number>());
  const movesStarted = useRef(0);
  const dismiss = useCallback(() => {
    setLastMove(null);
    setFailure(null);
  }, []);

  const save = async (id: string, to: TaskStatus): Promise<TaskStatus | null> => {
    const moveNumber = ++movesStarted.current;
    latestMoveOf.current.set(id, moveNumber);
    setPending((current) => new Map(current).set(id, to));
    setFailure(null);
    let confirmedFrom = to;
    try {
      await update.mutateAsync({
        id,
        change: (task) => {
          confirmedFrom = task.status;
          return { status: to };
        },
      });
      return confirmedFrom;
    } catch (error) {
      setFailure({ id, error: asError(error) });
      return null;
    } finally {
      if (latestMoveOf.current.get(id) === moveNumber) {
        latestMoveOf.current.delete(id);
        setPending((current) => withoutMove(current, id));
      }
    }
  };

  const move = async (task: Task, to: TaskStatus): Promise<void> => {
    if (shownStatusOf(task, pending) === to) return;
    const from = await save(task.id, to);
    if (from !== null && from !== to) setLastMove({ id: task.id, from, to });
  };

  const current = lastMove === null ? undefined : tasks.find((task) => task.id === lastMove.id);
  const undoable = lastMove !== null && current !== undefined && shownStatusOf(current, pending) === lastMove.to ? lastMove : null;

  const undo = async (): Promise<string | null> => {
    if (undoable === null || undoing) return null;
    setUndoing(true);
    const restoredFrom = await save(undoable.id, undoable.from);
    setUndoing(false);
    if (restoredFrom === null) return null;
    setLastMove((latest) => (latest === undoable ? null : latest));
    return undoable.id;
  };

  return { pending, lastMove: undoable, failure, undoing, move, undo, dismiss };
}

function withoutMove(pending: PendingMoves, id: string): PendingMoves {
  const next = new Map(pending);
  next.delete(id);
  return next;
}
