import type { GraphState } from "../check/graph-health";
import type { CandidateEvidence, CheckMethod, DuplicateMatch } from "../journal/events";
import type { Priority, Resolution, TaskCategory, TaskStatus, TaskType } from "../model/types";
import type { CategoryRow, FoundRow } from "../stats/types";
import type { CoreMessages } from "./types";

export type LabelTables = {
  category: Record<TaskCategory, string>;
  noCategory: string;
  categoryRow: Record<CategoryRow["category"], string>;
  found: Record<FoundRow["found"], string>;
  status: Record<TaskStatus, string>;
  type: Record<TaskType, string>;
  priority: Record<Priority, string>;
  resolution: Record<Resolution, string>;
  evidence: Record<CandidateEvidence | "total", string>;
  checkMethod: Record<CheckMethod, string>;
  duplicateMatch: Record<DuplicateMatch, string>;
  graphState: Record<GraphState, string>;
};

type LabelLookups = Pick<
  CoreMessages,
  "categoryLabel" | "categoryRowLabel" | "foundRowLabel" | "statusLabel" | "priorityLabel" | "typeLabel" | "resolutionLabel" | "evidenceLabel" | "checkMethodLabel" | "duplicateMatchLabel" | "graphStateLabel"
>;

export function labelLookups(labels: LabelTables): LabelLookups {
  return {
    categoryLabel: (category) => (category === undefined ? labels.noCategory : labels.category[category]),
    categoryRowLabel: (category) => labels.categoryRow[category],
    foundRowLabel: (found) => labels.found[found],
    statusLabel: (status) => labels.status[status],
    priorityLabel: (priority) => labels.priority[priority],
    typeLabel: (type) => labels.type[type],
    resolutionLabel: (resolution) => labels.resolution[resolution],
    evidenceLabel: (evidence) => labels.evidence[evidence],
    checkMethodLabel: (method) => labels.checkMethod[method],
    duplicateMatchLabel: (match) => labels.duplicateMatch[match],
    graphStateLabel: (state) => labels.graphState[state],
  };
}
