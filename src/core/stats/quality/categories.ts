import type { Task, TaskCategory } from "../../model/types";
import { closingsOf, type TaskHistory } from "../history";
import type { Period } from "../period";
import { PRIORITY_WEIGHT } from "../weights";
import type { CategoryRow } from "../types";

export function categoryBreakdown(openTasks: readonly Task[], histories: readonly TaskHistory[], period: Period): CategoryRow[] {
  const rows = new Map<TaskCategory | null, CategoryRow>();
  const row = (category: TaskCategory | undefined): CategoryRow => {
    const key = category ?? null;
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
  for (const history of histories) {
    if (period.contains(history.createdAt)) row(history.category).created += 1;
    row(history.category).closed += closingsOf(history).filter((closing) => period.contains(closing.at)).length;
  }
  return [...rows.values()]
    .filter((entry) => entry.open + entry.created + entry.closed > 0)
    .sort(
      (a, b) =>
        Number(a.category === null) - Number(b.category === null) ||
        b.weight - a.weight ||
        b.created - a.created ||
        (a.category ?? "").localeCompare(b.category ?? ""),
    );
}
