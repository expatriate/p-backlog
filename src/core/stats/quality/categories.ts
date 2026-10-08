import type { Recorded } from "../../journal/events";
import type { Task, TaskCategory } from "../../model/types";
import { closingsOfIn, createdIn, type TaskHistory } from "../history";
import type { Period } from "../period";
import { PRIORITY_WEIGHT } from "../weights";
import type { CategoryRow } from "../types";

export function categoryBreakdown(openTasks: readonly Task[], histories: readonly TaskHistory[], period: Period): CategoryRow[] {
  const rows = new Map<CategoryRow["category"], CategoryRow>();
  const row = (category: Recorded<TaskCategory> | undefined): CategoryRow => {
    const key = category ?? "unset";
    const existing = rows.get(key);
    if (existing !== undefined) return existing;
    const created: CategoryRow = { category: key, open: 0, weight: 0, created: 0, closed: 0 };
    rows.set(key, created);
    return created;
  };
  for (const task of openTasks) {
    const target = row(task.category);
    target.open += 1;
    target.weight += PRIORITY_WEIGHT[task.priority];
  }
  for (const history of createdIn(histories, period)) row(history.category).created += 1;
  for (const history of histories) row(history.category).closed += closingsOfIn(history, period).length;
  return [...rows.values()]
    .filter((entry) => entry.open + entry.created + entry.closed > 0)
    .sort((a, b) => Number(a.category === "unset") - Number(b.category === "unset") || b.weight - a.weight || b.created - a.created || a.category.localeCompare(b.category));
}
