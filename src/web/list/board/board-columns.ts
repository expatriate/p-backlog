import { TASK_STATUSES, type Task, type TaskStatus } from "../../../core/model/types";

export type BoardColumn = { status: TaskStatus; tasks: Task[]; filteredOut: boolean };

export type PendingMoves = ReadonlyMap<string, TaskStatus>;

const ALWAYS_SHOWN: TaskStatus = "done";

export function shownStatusOf(task: Task, pending: PendingMoves): TaskStatus {
  return pending.get(task.id) ?? task.status;
}

export function boardColumns(tasks: readonly Task[], statuses: readonly TaskStatus[] | undefined, pending: PendingMoves): BoardColumn[] {
  const visibleStatuses = statuses ?? TASK_STATUSES;
  const cards = tasks.filter((task) => task.type === "task");
  return TASK_STATUSES.filter((status) => visibleStatuses.includes(status) || status === ALWAYS_SHOWN).map((status) => ({
    status,
    tasks: cards.filter((task) => shownStatusOf(task, pending) === status),
    filteredOut: !visibleStatuses.includes(status),
  }));
}
