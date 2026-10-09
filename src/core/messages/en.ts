import { z } from "zod";
import type { CheckFix, CheckProblem } from "../check/findings";
import type { GraphState } from "../check/graph-health";
import { lineSuffix, sourcePath } from "../model/source";
import { formatDayMonth, formatDecimal, formatNumber } from "../i18n/format";
import { countEn, NBSP, pluralEn } from "../i18n/plural";
import type { CandidateEvidence, CheckMethod, DuplicateMatch } from "../journal/events";
import type { Problem, SchemaIssue } from "../model/problems";
import type { Priority, Resolution, TaskCategory, TaskStatus, TaskType } from "../model/types";
import type { CategoryRow, FlowForecast, FoundRow, Signal } from "../stats/types";
import { forecastOutlook, forecastSpan } from "./forecast";
import { problemList } from "./problem-list";
import type { CoreMessages, CountUnit } from "./types";
import { zodIssueText } from "./zod";

const zodEn = z.locales.en().localeError;

const CATEGORY_LABELS: Record<TaskCategory, string> = {
  bloaters: "Bloaters",
  "change-preventers": "Change preventers",
  couplers: "Couplers",
  "data-dealers": "Data dealers",
  dispensables: "Dispensables",
  "functional-abusers": "Functional abusers",
  "lexical-abusers": "Lexical abusers",
  "oo-abusers": "OO abusers",
  obfuscators: "Obfuscators",
  bug: "Bug",
};

const NO_CATEGORY_LABEL = "not set";

const CATEGORY_ROW_LABELS: Record<CategoryRow["category"], string> = { ...CATEGORY_LABELS, unset: NO_CATEGORY_LABEL, unknown: "unknown" };

const FOUND_ROW_LABELS: Record<FoundRow["found"], string> = { review: "in review", incidental: "incidentally", manual: "manually", unknown: "unknown", unset: "not recorded" };

const STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: "backlog",
  "in-progress": "in progress",
  blocked: "blocked",
  done: "done",
  cancelled: "cancelled",
};

const TYPE_LABELS: Record<TaskType, string> = { task: "task", epic: "epic" };

const PRIORITY_LABELS: Record<Priority, string> = { low: "low", medium: "medium", high: "high", critical: "critical" };

const RESOLUTION_LABELS: Record<Resolution, string> = { fixed: "fixed", obsolete: "code gone", duplicate: "duplicate", "epic-done": "epic done" };

const EVIDENCE_LABELS: Record<CandidateEvidence | "total", string> = {
  "source-changed": "code changed",
  "source-missing": "file missing",
  duplicate: "duplicate",
  "no-source": "no source",
  total: "Total",
};

const CHECK_METHOD_LABELS: Record<CheckMethod, string> = { symbol: "by symbol", anchor: "by source lines", file: "by file" };

const DUPLICATE_MATCH_LABELS: Record<DuplicateMatch, string> = { source: "by code location", title: "by title", symbol: "by symbol" };

const GRAPH_STATE_LABELS: Record<GraphState, string> = { none: "none", unreadable: "unreadable", stale: "stale", fresh: "fresh" };

const COUNT_FORMS: Record<CountUnit, [string, string]> = {
  task: ["task", "tasks"],
  line: ["line", "lines"],
  project: ["project", "projects"],
  day: ["day", "days"],
  week: ["week", "weeks"],
  session: ["session", "sessions"],
};

function count(n: number, unit: CountUnit): string {
  const [one, other] = COUNT_FORMS[unit];
  return countEn(n, one, other);
}

function days(value: number | null): string {
  if (value === null) return "—";
  if (value < 1) return "less than a day";
  return count(Math.round(value), "day");
}

function p90(value: number | null): string {
  if (value === null) return "—";
  return value < 1 ? "within a day" : `within ${days(value)}`;
}

function forecast(flow: FlowForecast): string {
  const outlook = forecastOutlook(flow);
  switch (outlook.kind) {
    case "no-open":
      return "No open tasks";
    case "clears":
      return `Debt clears in about ${formatNumber("en", outlook.weeks)}${NBSP}wk. (by ${formatDayMonth("en", outlook.until)})`;
    case "not-shrinking":
      return "Debt is not shrinking";
    case "grows":
      return `Debt grows by ${formatDecimal("en", outlook.perWeek)}${NBSP}${pluralEn(outlook.perWeek, ...COUNT_FORMS.task)} a week`;
  }
}

function forecastTail({ windowDays, closed, created }: FlowForecast): string {
  const span = forecastSpan(windowDays);
  return `over ${count(span.count, span.unit)}: closed ${closed}, created ${created}`;
}

function signal(s: Signal): string {
  switch (s.kind) {
    case "debt-growing":
      return `Debt has grown for ${count(s.params.weeks, "week")} straight: created ${s.params.created}, closed ${s.params.closed}`;
    case "urgent-stale":
      return `Urgent tasks have been waiting more than ${count(s.params.days, "day")}: ${s.params.count}`;
    case "stuck":
      return `Stuck in progress: ${s.params.count}, longest ${s.params.id} — ${days(s.params.days)}`;
    case "noisy-check": {
      const { evidence, method, percent, decided, windowDays } = s.params;
      const name = method === null ? `"${EVIDENCE_LABELS[evidence]}"` : `"${EVIDENCE_LABELS[evidence]}" ${CHECK_METHOD_LABELS[method]}`;
      return `Check ${name} is almost always wrong: precision ${percent}% on ${decided} decided over ${count(windowDays, "day")}`;
    }
    case "low-changed":
      return `Code changed for ${count(s.params.count, "task")} with low priority — re-check when convenient ("clean up the backlog")`;
    case "stale-low":
      return `Tasks with low priority older than ${count(s.params.days, "day")}: ${s.params.count} — clean them up (backlog prune)`;
  }
}

function schemaIssue(issue: SchemaIssue): string {
  switch (issue.kind) {
    case "bad-id":
      return "invalid ID";
    case "empty-title":
      return "empty title";
    case "empty-name":
      return "empty project name";
    case "bad-prefix":
      return "invalid prefix";
    case "zod":
      return zodIssueText(zodEn, issue);
  }
}

function problem(p: Problem): string {
  switch (p.code) {
    case "self-block":
      return "a task cannot block itself";
    case "self-related":
      return "a task cannot be related to itself";
    case "referenced-as-epic":
      return `other tasks refer to this task as their epic: ${p.children.join(", ")}`;
    case "blocker-cycle":
      return `blocker cycle: ${p.cycle.join(" → ")}`;
    case "resolution-needs-status":
      return `resolution ${p.resolution} requires status ${p.status}`;
    case "reason-without-resolution":
      return "reason can only be set together with resolution";
    case "epic-self":
      return "a task cannot be its own epic";
    case "epic-missing":
      return `epic ${p.epic} not found`;
    case "epic-not-epic":
      return `${p.epic} is not an epic`;
    case "epic-foreign-project":
      return `epic ${p.epic} belongs to another project — clear the epic or pick one from this project`;
    case "epic-in-epic":
      return "an epic cannot belong to another epic";
    case "reference-missing":
      return `${p.id} not found`;
    case "no-frontmatter":
      return "file does not start with frontmatter (---)";
    case "frontmatter-unclosed":
      return "frontmatter is not closed with a --- line";
    case "yaml":
      return `YAML error: ${p.detail}`;
    case "schema":
      return p.path === "" ? schemaIssue(p.issue) : `${p.path}: ${schemaIssue(p.issue)}`;
    case "id-mismatch":
      return `id ${p.id} does not match the file name ${p.file}.md`;
    case "prefix-mismatch":
      return `prefix of ${p.file} does not match the project prefix ${p.prefix}`;
    case "id-exhausted":
      return `could not allocate an ID in ${p.attempts} attempts`;
  }
}

const problems = problemList(problem);

function epicDoneReason(ids: readonly string[]): string {
  return `all tasks of the epic are closed: ${ids.join(", ")}`;
}

function checkFix(fix: CheckFix): string {
  switch (fix.kind) {
    case "references-removed":
      return `${fix.taskId}: removed references to missing tasks: ${fix.ids.join(", ")}`;
    case "epic-closed":
      return `${fix.taskId}: epic closed — ${epicDoneReason(fix.childIds)}`;
    case "epic-reopened":
      return `${fix.taskId}: epic reopened — it has open tasks: ${fix.childIds.join(", ")}`;
    case "source-moved":
      return sourcePath(fix.from) === sourcePath(fix.to) ? `${fix.taskId}: source moved ${lineSuffix(fix.from)} → ${lineSuffix(fix.to)}` : `${fix.taskId}: task file renamed, source ${fix.from} → ${fix.to}`;
  }
}

function checkProblem(p: CheckProblem): string {
  switch (p.kind) {
    case "fix-failed":
      return `${p.taskId}: could not fix — ${fixFailureCause(p)}`;
    case "task-invalid":
      return `${p.taskId}: ${problem(p.problem)}`;
    case "file-not-parsed":
      return `File ${p.path} could not be parsed: ${problems(p.problems)}`;
    case "epics-wait-for-files":
      return `Epics ${p.epicIds.join(", ")} are complete but will not close until the unparsed files are fixed`;
    case "project-without-repos":
      return `Project ${p.projectId}: repos has no paths — its tasks' code cannot be checked`;
    case "project-repos-missing":
      return `Project ${p.projectId}: none of the repos paths exist (${p.repos.join(", ")}) — its tasks' code cannot be checked`;
    case "project-repo-not-git":
      return `Project ${p.projectId}: ${p.repo} is not a git repository — commits and code edits of its tasks are not checked`;
    case "project-repo-unsafe":
      return `Project ${p.projectId}: git does not trust ${p.repo} (the directory belongs to another user) — commits and code edits of its tasks are not checked. Fix: git config --global --add safe.directory "${p.repo}"`;
    case "project-history-unreadable":
      return `Project ${p.projectId}: could not read the git history in ${p.repo} — commits and code edits of its tasks were not checked`;
    case "prefix-shared":
      return `Projects ${p.projectIds.join(", ")} share the prefix ${p.prefix} — their task IDs collide. Change prefix in project.md of one of them`;
  }
}

function fixFailureCause(p: Extract<CheckProblem, { kind: "fix-failed" }>): string {
  switch (p.cause) {
    case "invalid":
      return problems(p.problems);
    case "changed-during-check":
      return "the file changed during the check";
    case "gone-during-check":
      return "the file disappeared during the check";
    case "busy-during-check":
      return "the file is locked by another process";
  }
}

export const coreEn: CoreMessages = {
  hookMark: "Backlog",
  languageName: "English",
  problem,
  problems,
  schemaIssue,
  categoryLabel: (category) => (category === undefined ? NO_CATEGORY_LABEL : CATEGORY_LABELS[category]),
  categoryRowLabel: (category) => CATEGORY_ROW_LABELS[category],
  foundRowLabel: (found) => FOUND_ROW_LABELS[found],
  statusLabel: (status) => STATUS_LABELS[status],
  priorityLabel: (priority) => PRIORITY_LABELS[priority],
  typeLabel: (type) => TYPE_LABELS[type],
  resolutionLabel: (resolution) => RESOLUTION_LABELS[resolution],
  evidenceLabel: (evidence) => EVIDENCE_LABELS[evidence],
  checkMethodLabel: (method) => CHECK_METHOD_LABELS[method],
  duplicateMatchLabel: (match) => DUPLICATE_MATCH_LABELS[match],
  graphStateLabel: (state) => GRAPH_STATE_LABELS[state],
  count,
  days,
  p90,
  forecast,
  forecastTail,
  signal,
  epicDoneReason,
  fileBusy: ({ path, lock, seconds }) => `${path} has been locked by another process for more than ${seconds} s (${lock})`,
  checkFix,
  checkProblem,
  runsNotTrimmed: (error) => `Could not trim the run log: ${error}`,
  journalNotCompacted: (dir, error) => `Could not compact the journal in ${dir}: ${error}`,
  closedNotSwept: (error) => `Could not delete closed tasks: ${error}`,
  serviceLogNotTrimmed: (error) => `Could not trim the service log: ${error}`,
  candidatesRecordFailed: (projectId, detail) => `Could not record candidates to the ${projectId} journal: ${detail}`,
  branchOriginsReadFailed: (projectId, detail) => `Could not read the ${projectId} journal — tasks from unmerged branches are checked as usual: ${detail}`,
  unreadableSkipped: (path, detail) => `Could not read ${path}, skipped: ${detail}`,
  settingsNotSaved: (path, detail) => `Could not save the language to ${path}: ${detail}. It is detected again on every run — make the backlog directory writable.`,
};
