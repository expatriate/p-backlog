import type { Task } from "../model/types";
import { sourcePath } from "../model/source";

export type TaskRef = { id: string; title: string };

export function isReviewable(task: Task): boolean {
  return task.type === "task" && (task.status === "backlog" || task.status === "blocked");
}

export function sourcePaths(tasks: readonly Task[]): string[] {
  return [...new Set(tasks.flatMap((task) => (task.source === undefined ? [] : [sourcePath(task.source)])))];
}

export function reviewMark(task: Task): number {
  const verified = task.verified === undefined ? Number.NEGATIVE_INFINITY : Date.parse(task.verified);
  return Math.max(Date.parse(task.created), verified);
}

export function taskRef(task: Task): TaskRef {
  return { id: task.id, title: task.title };
}
