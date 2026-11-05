import type { CheckFix, CheckProblem } from "../check/findings";
import type { GraphState } from "../check/graph-health";
import type { CandidateEvidence, CheckMethod, DuplicateMatch } from "../journal/events";
import type { Problem, SchemaIssue } from "../model/problems";
import type { Priority, Resolution, TaskCategory, TaskStatus, TaskType, UnparsedFile } from "../model/types";
import type { LockBusy } from "../store/file-lock";
import type { CategoryRow, FlowForecast, FoundRow, Signal } from "../stats/types";
import type { StoreMessages } from "./store-messages";

export type CountUnit = "task" | "line" | "project" | "day" | "week" | "session";

export type UntrustedRepoTexts = { reason: string; fix: string };

export type CoreMessages = StoreMessages & {
  hookMark: string;
  languageName: string;
  problems: (list: readonly Problem[]) => string;
  taskNotLoaded: (id: string, file: UnparsedFile) => string;
  untrustedRepo: (repo: string, trustCommand: string) => UntrustedRepoTexts;
  schemaIssue: (issue: SchemaIssue) => string;
  categoryLabel: (category: TaskCategory | undefined) => string;
  categoryRowLabel: (category: CategoryRow["category"]) => string;
  foundRowLabel: (found: FoundRow["found"]) => string;
  statusLabel: (status: TaskStatus) => string;
  priorityLabel: (priority: Priority) => string;
  typeLabel: (type: TaskType) => string;
  resolutionLabel: (resolution: Resolution) => string;
  evidenceLabel: (evidence: CandidateEvidence | "total") => string;
  checkMethodLabel: (method: CheckMethod) => string;
  duplicateMatchLabel: (match: DuplicateMatch) => string;
  graphStateLabel: (state: GraphState) => string;
  count: (n: number, unit: CountUnit) => string;
  days: (value: number | null) => string;
  p90: (value: number | null) => string;
  forecast: (flow: FlowForecast) => string;
  forecastTail: (flow: FlowForecast) => string;
  signal: (signal: Signal) => string;
  fileBusy: (busy: LockBusy) => string;
  checkFix: (fix: CheckFix) => string;
  checkProblem: (problem: CheckProblem) => string;
  candidatesRecordFailed: (projectId: string, detail: string) => string;
  branchOriginsReadFailed: (projectId: string, detail: string) => string;
  unreadableSkipped: (path: string, detail: string) => string;
  settingsNotSaved: (path: string, detail: string) => string;
  settingsFileInvalid: (path: string) => string;
};
