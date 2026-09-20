import { compareIds } from "../../model/ids";
import type { Task, TaskStatus } from "../../model/types";
import type { TaskHistory } from "../history";
import { daysBetween } from "../numbers";
import type { LongestInWork, WorkStatus } from "../types";

export function inWorkTasks(tasks: readonly Task[], histories: readonly TaskHistory[], now: Date): LongestInWork[] {
  const nowMs = now.getTime();
  const historyById = new Map(histories.map((history) => [history.id, history]));
  return tasks
    .flatMap((task) => (isWorkStatus(task.status) ? [{ task, status: task.status }] : []))
    .map(({ task, status }): LongestInWork => {
      const entered = historyById.get(task.id)?.transitions.filter((transition) => transition.to === status && transition.at <= nowMs).at(-1)?.at;
      return {
        id: task.id,
        projectId: task.projectId,
        title: task.title,
        status,
        days: daysBetween(entered ?? Date.parse(task.created), nowMs),
        atLeast: entered === undefined,
      };
    })
    .sort((a, b) => b.days - a.days || compareIds(a.id, b.id));
}

function isWorkStatus(status: TaskStatus): status is WorkStatus {
  return status === "in-progress" || status === "blocked";
}
