import { compareIds } from "../../model/ids";
import type { Task, TaskStatus } from "../../model/types";
import type { TaskHistory } from "../history";
import { daysBetween } from "../../model/dates";

const WORK_STATUSES = ["in-progress", "blocked"] as const satisfies readonly TaskStatus[];

export type WorkStatus = (typeof WORK_STATUSES)[number];

type TaskInWork = { id: string; status: WorkStatus; days: number };

export function inWorkTasks(tasks: readonly Task[], histories: readonly TaskHistory[], now: Date): TaskInWork[] {
  const nowMs = now.getTime();
  const historyById = new Map(histories.map((history) => [history.id, history]));
  return tasks
    .flatMap((task) => (isWorkStatus(task.status) ? [{ task, status: task.status }] : []))
    .map(({ task, status }): TaskInWork => {
      const entered = historyById
        .get(task.id)
        ?.transitions.filter((transition) => transition.to === status && transition.at <= nowMs)
        .at(-1)?.at;
      return {
        id: task.id,
        status,
        days: daysBetween(entered ?? Date.parse(task.created), nowMs),
      };
    })
    .sort((a, b) => b.days - a.days || compareIds(a.id, b.id));
}

function isWorkStatus(status: TaskStatus): status is WorkStatus {
  return WORK_STATUSES.some((workStatus) => workStatus === status);
}
