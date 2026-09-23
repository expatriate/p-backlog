import { z } from "zod";
import type { GraphState } from "../check/graph-health";
import { formatDayMonth } from "../i18n/format";
import { countEn, pluralEn } from "../i18n/plural";
import type { CandidateEvidence, CheckMethod, DuplicateMatch } from "../journal/events";
import type { Problem, SchemaIssue } from "../model/problems";
import type { Priority, Resolution, TaskCategory, TaskStatus } from "../model/types";
import { roundToTenth } from "../stats/format";
import type { FlowForecast, Signal } from "../stats/types";
import type { CoreMessages, CountUnit } from "./index";
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

const STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: "backlog",
  "in-progress": "in progress",
  blocked: "blocked",
  done: "done",
  cancelled: "cancelled",
};

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

function evidenceLabel(evidence: CandidateEvidence | "total"): string {
  return EVIDENCE_LABELS[evidence];
}

function checkMethodLabel(method: CheckMethod): string {
  return CHECK_METHOD_LABELS[method];
}

function duplicateMatchLabel(match: DuplicateMatch): string {
  return DUPLICATE_MATCH_LABELS[match];
}

function graphStateLabel(state: GraphState): string {
  return GRAPH_STATE_LABELS[state];
}

function count(n: number, unit: CountUnit): string {
  const [one, other] = COUNT_FORMS[unit];
  return countEn(n, one, other);
}

function days(value: number | null): string {
  if (value === null) return "—";
  if (value < 1) return "less than a day";
  const rounded = Math.round(value);
  return `${rounded} ${pluralEn(rounded, "day", "days")}`;
}

function p90(value: number | null): string {
  if (value === null) return "—";
  return value < 1 ? "within a day" : `within ${days(value)}`;
}

function forecast({ open, weeklyNet, weeks, until }: FlowForecast): string {
  if (open === 0) return "No open tasks";
  if (weeks !== null && until !== null) return `Debt clears in about ${weeks} wk. (by ${formatDayMonth("en", new Date(until))})`;
  if (weeklyNet === 0) return "Debt is not shrinking";
  const growth = roundToTenth(-weeklyNet);
  return `Debt grows by ${growth} ${pluralEn(growth, "task", "tasks")} a week`;
}

function forecastTail({ windowWeeks, closed, created }: FlowForecast): string {
  return `over ${countEn(windowWeeks, "week", "weeks")}: closed ${closed}, created ${created}`;
}

function signal(s: Signal): string {
  switch (s.kind) {
    case "debt-growing":
      return `Debt has grown for ${countEn(s.params.weeks, "week", "weeks")} straight: created ${s.params.created}, closed ${s.params.closed}`;
    case "urgent-stale":
      return `Urgent tasks have been waiting more than ${countEn(s.params.days, "day", "days")}: ${s.params.count}`;
    case "stuck":
      return `Stuck in progress: ${s.params.count}, longest ${s.params.id} — ${days(s.params.days)}`;
    case "noisy-check": {
      const { evidence, method, percent, decided, windowDays } = s.params;
      const name = method === null ? `"${evidenceLabel(evidence)}"` : `"${evidenceLabel(evidence)}" ${checkMethodLabel(method)}`;
      return `Check ${name} is almost always wrong: precision ${percent}% on ${decided} decided over ${countEn(windowDays, "day", "days")}`;
    }
    case "low-changed":
      return `Code changed for ${countEn(s.params.count, "task", "tasks")} with low priority — re-check when convenient ("clean up the backlog")`;
    case "stale-low":
      return `Tasks with low priority older than ${countEn(s.params.days, "day", "days")}: ${s.params.count} — clean them up (backlog prune)`;
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

function problems(list: readonly Problem[]): string {
  return [...new Set(list.map(problem))].join("; ");
}

export const coreEn: CoreMessages = {
  problem,
  problems,
  schemaIssue,
  categoryLabel: (category) => (category === undefined ? "not set" : CATEGORY_LABELS[category]),
  statusLabel: (status) => STATUS_LABELS[status],
  priorityLabel: (priority) => PRIORITY_LABELS[priority],
  resolutionLabel: (resolution) => RESOLUTION_LABELS[resolution],
  evidenceLabel,
  checkMethodLabel,
  duplicateMatchLabel,
  graphStateLabel,
  count,
  days,
  p90,
  forecast,
  forecastTail,
  signal,
  epicDoneReason: (ids) => `all tasks of the epic are closed: ${ids.join(", ")}`,
  fileBusy: (path, lock, seconds) => `${path} has been locked by another process for more than ${seconds} s (${lock})`,
  referencesRemoved: (ids) => `removed references to missing tasks: ${ids.join(", ")}`,
  epicClosed: (reason) => `epic closed — ${reason}`,
  fixFailed: (id, detail) => `${id}: could not fix — ${detail}`,
  changedDuringCheck: "the file changed during the check",
  goneDuringCheck: "the file disappeared during the check",
  fileNotParsed: (path, list) => `File ${path} could not be parsed: ${problems(list)}`,
  epicsWaitForFiles: (ids) => `Epics ${ids.join(", ")} are complete but will not close until the unparsed files are fixed`,
  projectWithoutRepos: (projectId) => `Project ${projectId}: repos has no paths — its tasks' code cannot be checked`,
  projectReposMissing: (projectId, repos) => `Project ${projectId}: none of the repos paths exist (${repos.join(", ")}) — its tasks' code cannot be checked`,
  sourceMoved: (id, from, to) => `${id}: source moved ${from} → ${to}`,
  moreDiffLines: (count) => `… ${count} more ${pluralEn(count, "line", "lines")}`,
  candidatesRecordFailed: (projectId, detail) => `Could not record candidates to the ${projectId} journal: ${detail}`,
};
