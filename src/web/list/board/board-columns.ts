import { TASK_STATUSES, type Task, type TaskStatus } from "../../../core/model/types";

export type BoardColumn = { status: TaskStatus; tasks: Task[]; filteredOut: boolean };

export type PendingMoves = ReadonlyMap<string, TaskStatus>;

const ALWAYS_SHOWN: TaskStatus = "done";

export function boardColumns(tasks: readonly Task[], statuses: readonly TaskStatus[] | undefined, pending: PendingMoves): BoardColumn[] {
  const shown = statuses ?? TASK_STATUSES;
  const shownStatus = (task: Task) => pending.get(task.id) ?? task.status;
  const cards = tasks.filter((task) => task.type === "task");
  return TASK_STATUSES.filter((status) => shown.includes(status) || status === ALWAYS_SHOWN).map((status) => ({
    status,
    tasks: cards.filter((task) => shownStatus(task) === status),
    filteredOut: !shown.includes(status),
  }));
}
