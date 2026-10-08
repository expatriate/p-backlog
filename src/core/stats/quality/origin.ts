import { FOUND_HOW, UNKNOWN } from "../../journal/events";
import { isClosed } from "../../model/graph";
import type { ProjectLabel } from "../format";
import { createdIn, isFixedNow, type TaskHistory } from "../history";
import type { Period } from "../period";
import type { BranchRow, FoundRow } from "../types";
import { groupBy } from "../../collections";

const BRANCH_LIMIT = 8;
const FOUND_ORDER: readonly FoundRow["found"][] = [...FOUND_HOW, UNKNOWN, "unset"];

export function foundBreakdown(histories: readonly TaskHistory[], period: Period): FoundRow[] {
  const created = createdIn(histories, period);
  return FOUND_ORDER.map((found) => {
    const own = created.filter((history) => (history.found ?? "unset") === found);
    return {
      found,
      created: own.length,
      open: own.filter(isOpenNow).length,
      fixed: own.filter(isFixedNow).length,
    };
  });
}

export function branchBreakdown(histories: readonly TaskHistory[], period: Period, projectLabel: ProjectLabel): BranchRow[] {
  const branched = createdIn(histories, period).flatMap((history) => (history.branch === undefined ? [] : [{ history, label: projectLabel(history.projectId, history.branch) }]));
  return [...groupBy(branched, ({ label }) => label).entries()]
    .map(([label, own]): BranchRow => ({ label, created: own.length, open: own.filter(({ history }) => isOpenNow(history)).length }))
    .sort((a, b) => b.created - a.created || a.label.localeCompare(b.label))
    .slice(0, BRANCH_LIMIT);
}

function isOpenNow(history: TaskHistory): boolean {
  return !isClosed(history.finalStatus);
}
