import type { TaskOrigin } from "../journal/events";
import type { Task } from "../model/types";
import type { HeadCommitAt } from "./repo-facts";

export function isReviewable(task: Task): boolean {
  return task.type === "task" && (task.status === "backlog" || task.status === "blocked");
}

export function reviewMark(task: Task): number {
  const verified = task.verified === undefined ? Number.NEGATIVE_INFINITY : Date.parse(task.verified);
  return Math.max(Date.parse(task.created), verified);
}

export function creationOrigin(task: Task, origins: ReadonlyMap<string, TaskOrigin>): TaskOrigin | undefined {
  return task.verified === undefined ? origins.get(task.id) : undefined;
}

export async function checkoutAtMark(task: Task, origins: ReadonlyMap<string, TaskOrigin>, headCommitAt: HeadCommitAt): Promise<string | null> {
  return creationOrigin(task, origins)?.commit ?? headCommitAt(new Date(reviewMark(task)));
}
