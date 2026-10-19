import { useCallback, useRef, useState } from "react";
import type { Task, TaskStatus } from "../../../core/model/types";
import { useUpdateTask } from "../../app/queries";
import type { PendingMoves } from "./board-columns";

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
  const dismiss = useCallback(() => setLastMove(null), []);

  const shownStatus = (task: Task): TaskStatus => pending.get(task.id) ?? task.status;

  const save = async ({ id, to }: BoardMove): Promise<boolean> => {
    const moveNumber = ++movesStarted.current;
    latestMoveOf.current.set(id, moveNumber);
    setPending((current) => new Map(current).set(id, to));
    setFailure(null);
    try {
      await update.mutateAsync({ id, change: () => ({ status: to }) });
      return true;
    } catch (error) {
      setFailure({ id, error: error instanceof Error ? error : new Error(String(error)) });
      return false;
    } finally {
      if (latestMoveOf.current.get(id) === moveNumber) {
        latestMoveOf.current.delete(id);
        setPending((current) => withoutMove(current, id));
      }
    }
  };

  const move = async (task: Task, to: TaskStatus): Promise<boolean> => {
    const from = shownStatus(task);
    if (from === to) return false;
    const done = { id: task.id, from, to };
    const saved = await save(done);
    if (saved) setLastMove(done);
    return saved;
  };

  const current = lastMove === null ? undefined : tasks.find((task) => task.id === lastMove.id);
  const undoable = lastMove !== null && current !== undefined && shownStatus(current) === lastMove.to ? lastMove : null;

  const undo = async (): Promise<string | null> => {
    if (undoable === null || undoing) return null;
    setUndoing(true);
    const undone = await save({ id: undoable.id, from: undoable.to, to: undoable.from });
    setUndoing(false);
    if (!undone) return null;
    setLastMove(null);
    return undoable.id;
  };

  return { pending, lastMove: undoable, failure, undoing, move, undo, dismiss };
}

function withoutMove(pending: PendingMoves, id: string): PendingMoves {
  const next = new Map(pending);
  next.delete(id);
  return next;
}
