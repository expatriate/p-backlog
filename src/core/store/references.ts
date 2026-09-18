import type { Task } from "../model/types";
import type { TaskChanges } from "./update";

export function referenceCleanup(task: Task, isGone: (id: string) => boolean): TaskChanges | null {
  const blockedBy = task.blockedBy.filter((id) => !isGone(id));
  const related = task.related.filter((id) => !isGone(id));
  const epicGone = task.epic !== undefined && isGone(task.epic);
  const untouched = blockedBy.length === task.blockedBy.length && related.length === task.related.length && !epicGone;
  if (untouched) return null;
  return epicGone ? { blockedBy, related, epic: null } : { blockedBy, related };
}
