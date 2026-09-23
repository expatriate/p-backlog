import { FOUND_HOW, type FoundHow } from "../../journal/events";
import { isClosed } from "../../model/graph";
import { projectLabel } from "../format";
import { isFixedNow, type TaskHistory } from "../history";
import type { Period } from "../period";
import type { BranchRow, FoundRow } from "../types";

const BRANCH_LIMIT = 8;
const FOUND_ORDER: readonly (FoundHow | null)[] = [...FOUND_HOW, null];

export function foundBreakdown(histories: readonly TaskHistory[], period: Period): FoundRow[] {
  const created = createdIn(histories, period);
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

export function branchBreakdown(histories: readonly TaskHistory[], period: Period, withProject: boolean): BranchRow[] {
  const rows = new Map<string, BranchRow>();
  for (const history of createdIn(histories, period)) {
    if (history.branch === undefined) continue;
    const label = projectLabel(history.projectId, history.branch, withProject);
    const current = rows.get(label) ?? { label, created: 0, open: 0 };
    rows.set(label, { label, created: current.created + 1, open: current.open + (isOpenNow(history) ? 1 : 0) });
  }
  return [...rows.values()].sort((a, b) => b.created - a.created || a.label.localeCompare(b.label)).slice(0, BRANCH_LIMIT);
}

function createdIn(histories: readonly TaskHistory[], period: Period): TaskHistory[] {
  return histories.filter((history) => period.contains(history.createdAt));
}

function isOpenNow(history: TaskHistory): boolean {
  return !isClosed(history.finalStatus);
}
