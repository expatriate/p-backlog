import { compareIds } from "../../model/ids";
import type { Task, TaskStatus } from "../../model/types";
import type { TaskHistory } from "../history";
import { daysBetween } from "../numbers";
import type { FlowNow, LongestInWork, WorkStatus } from "../types";

const LONGEST_LIMIT = 5;

export function flowNow(tasks: readonly Task[], histories: readonly TaskHistory[], now: Date): FlowNow {
  const nowMs = now.getTime();
  const historyById = new Map(histories.map((history) => [history.id, history]));
  const inWork = tasks.flatMap((task) => (isWorkStatus(task.status) ? [{ task, status: task.status }] : []));
  const longest = inWork
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
    .sort((a, b) => b.days - a.days || compareIds(a.id, b.id))
    .slice(0, LONGEST_LIMIT);
  return {
    inProgress: inWork.filter((item) => item.status === "in-progress").length,
    blocked: inWork.filter((item) => item.status === "blocked").length,
    longest,
  };
}

function isWorkStatus(status: TaskStatus): status is WorkStatus {
  return status === "in-progress" || status === "blocked";
}
