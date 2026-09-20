import { FOUND_HOW, type FoundHow } from "../../journal/events";
import { isClosed } from "../../model/graph";
import { isFixedNow, type TaskHistory } from "../history";
import type { BranchRow, FoundRow } from "../types";

const BRANCH_LIMIT = 8;
const FOUND_ORDER: readonly (FoundHow | null)[] = [...FOUND_HOW, null];

export function foundBreakdown(histories: readonly TaskHistory[], from: number, to: number): FoundRow[] {
  const created = createdIn(histories, from, to);
  return FOUND_ORDER.map((found) => {
    const own = created.filter((history) => (history.found ?? null) === found);
    return {
      found,
      created: own.length,
      open: own.filter(isOpenNow).length,
      fixed: own.filter(isFixedNow).length,
    };
  });
}

export function branchBreakdown(histories: readonly TaskHistory[], from: number, to: number, withProject: boolean): BranchRow[] {
  const rows = new Map<string, BranchRow>();
  for (const history of createdIn(histories, from, to)) {
    if (history.branch === undefined) continue;
    const label = withProject ? `${history.projectId} · ${history.branch}` : history.branch;
    const current = rows.get(label) ?? { label, created: 0, open: 0 };
    rows.set(label, { label, created: current.created + 1, open: current.open + (isOpenNow(history) ? 1 : 0) });
  }
  return [...rows.values()].sort((a, b) => b.created - a.created || a.label.localeCompare(b.label)).slice(0, BRANCH_LIMIT);
}

function createdIn(histories: readonly TaskHistory[], from: number, to: number): TaskHistory[] {
  return histories.filter((history) => history.createdAt >= from && history.createdAt <= to);
}

function isOpenNow(history: TaskHistory): boolean {
  return !isClosed(history.finalStatus);
}
