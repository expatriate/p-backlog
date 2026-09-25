import { CHURN_DAYS } from "../../core/code/code-window";
import { formatDecimal } from "../../core/i18n/format";
import { countEn, NBSP, pluralEn } from "../../core/i18n/plural";
import { STALE_URGENT_DAYS } from "../../core/stats/breakdowns";
import { MIN_FIXES_FOR_ESTIMATE } from "../../core/stats/effect/effect-report";
import { STATS_WEEKS } from "../../core/stats/weeks";
import type { ChartStep } from "./charts/chart-style";
import { formatApprox, formatLines, isEstimated } from "./effect-format";
import type { StatsMessages } from "./messages.ru";

const CHURN_PERIOD = countEn(CHURN_DAYS, "day", "days");
const STATS_PERIOD = countEn(STATS_WEEKS, "week", "weeks");
const CHART_STEPS: Record<ChartStep, string> = { day: "day", week: "week", sample: "sample" };
const ESTIMATE_LATER = `the estimate appears after ${MIN_FIXES_FOR_ESTIMATE} fixes`;

const weeks = (n: number): string => countEn(n, "week", "weeks");
const tasks = (n: number): string => countEn(n, "task", "tasks");
const tokens = (n: number): string => countEn(n, "token", "tokens");

function linesText(lines: number, approx: boolean): string {
  return `${formatApprox("en", lines, approx)}${NBSP}${pluralEn(Math.round(lines), "line", "lines")}`;
}

export const statsEn: StatsMessages = {
  docTitle: (heading) => `${heading} — Backlog`,
  heading: (scopeName) => `Statistics · ${scopeName}`,
  alerts: "Alerts",
  tabsLabel: "Statistics sections",
  tabs: { overview: "Overview", code: "Code", quality: "Quality", effect: "Effect", cost: "Cost" },

  invalidJournalLines: (n) => `Could not parse journal lines: ${n}. They are left out of the statistics — check the line format in the project's journal.jsonl.`,
  unknownJournalLines: (n) =>
    `Journal lines with an unknown value: ${n}. A renamed value (category, how found, resolution) is shown as "unknown", but is counted in the breakdowns.`,
  unparsedTasks: (n) => `Could not parse task files: ${n}. The statistics use their last status from the journal; fix the files — backlog check shows the errors.`,
  noTasks: "No tasks yet.",
  projectNotFound: "Project not found.",
  loading: "Calculating statistics…",
  journalEmpty: "The journal is still empty; everything is built from the dates in the task files.",
  journalSince: (date) => `The journal has been kept since ${date}; before that, dates come from the task files. Tasks deleted before then are not in the statistics.`,
  unavailableRepo: (repo) => `No access to the repository: ${repo}. Check the path in repos of project.md and that it is a git repository.`,
  tableLabel: (label) => `Table "${label}"`,
  noCodeData: "No code data: the projects have no accessible repositories",
  folders: "Folders",
  projects: "Projects",

  chartLabel: (name, step) => `${name}. Left and right arrows move by ${CHART_STEPS[step]}`,
  weekOf: (day) => `week of ${day}`,
  weekTrend: (arrow, size) => `${arrow}${NBSP}${size}${NBSP}vs${NBSP}last${NBSP}week`,
  weekTrendSpeech: (size, better) => `${size} ${better ? "less" : "more"} than a week ago — ${better ? "better" : "worse"}`,

  tasksToday: "Tasks today",
  createdAndClosed: "created and closed",
  thisWeek: "This week",
  weekNote: (created, closed) => `created ${created}, closed ${closed}`,
  debtByWeek: "Debt by week",
  flowCreated: "created",
  flowClosed: "closed",
  flowOpen: "open",
  flowOpenAtWeekEnd: "open at week end",
  flowSummary: ({ weekCount, created, closed, openNow }) => `${weeks(weekCount)}: created ${created}, closed ${closed}, open now ${openNow}`,
  createdByDay: "Created by day",
  createdTasks: "tasks created",
  intakeSummary: (dayCount, created) => {
    const period = countEn(dayCount, "day", "days");
    if (created === 0) return `${period}: no tasks created`;
    return `${period}: created ${created}, on average ${formatDecimal("en", created / dayCount)} a day`;
  },
  hotspots: "Where it hurts",
  noSourceFolders: "Open tasks have no source",
  tags: "Tags",
  noTags: "Open tasks have no tags",
  openAge: "Age of open tasks",
  ageBuckets: { week: "up to 7 days", month: "7–30 days", quarter: "30–90 days", older: "over 90 days" },
  priorityCounts: { critical: "critical", high: "high", medium: "medium", low: "low" },
  urgentStale: (n) => `Critical and high older than ${STALE_URGENT_DAYS} days: ${n}`,
  closing: "How tasks close",
  closingReasons: { done: "done", cancelled: "cancelled", unknown: "resolution not recognized" },
  noiseAndReopens: "Noise and reopens",
  duplicatesAmongClosed: "Duplicates among closed",
  noSourceAmongCreated: "No source among created",
  reopened: "Reopened",

  codeNote: `Changes are commits over ${CHURN_PERIOD}; lines are at the latest commit.`,
  churnTitle: "Debt in frequently changed code",
  churnHint: `Rank is commits over ${CHURN_PERIOD} × weight of the folder's open tasks`,
  churnEmpty: `No debt lies in code changed over ${CHURN_PERIOD}`,
  commits: (n) => countEn(n, "commit", "commits"),
  churnTasks: (n, weight) => `${tasks(n)}, weight ${weight}`,
  densityTitle: "Debt density",
  perKloc: (value) => `${formatDecimal("en", value)} per 1000${NBSP}lines`,

  accuracyTitle: "Check precision",
  noCandidates: "The check has not found any candidates yet",
  accuracyHint: "Share of check candidates after which the task was closed; the rest were confirmed as still relevant",
  accuracyTable: "Check precision for the period",
  accuracyHead: ["Evidence", "Candidates", "Closed", "Confirmed", "Undecided", "Precision"],
  splitRow: (label) => `└ of them ${label}`,
  beforeMethodRecorded: "before the method was recorded",
  checkedBy: (method) => `checked ${method}`,
  beforeMatchRecorded: "before the match was recorded",
  matchedBy: (match) => `matched ${match}`,
  decidedCandidates: "candidates decided",
  precision: "precision",
  accuracySummary: (weekCount, decided, latestPrecision) =>
    latestPrecision === null ? `${weeks(weekCount)}: no decided candidates` : `${weeks(weekCount)}: decided ${decided}, precision in the last week ${latestPrecision}`,
  graphTitle: "Code graph",
  graphMissing: (code) => [
    "No code graph: the check compares source lines and the whole file. ",
    code("code-review-graph build"),
    " in the project repository enables the check by symbol",
  ],
  graphHint: 'The graph drops the "code changed" candidate when an edit touched another symbol of the same file, so the agent does not have to re-read the task',
  filteredTitle: `Filtered out over ${STATS_PERIOD}`,
  nothingFiltered: "The graph has not filtered out any candidates",
  filteredTable: "What happened to the filtered-out candidates",
  filteredHead: ["Outcome", "Candidates"],
  filteredByGraph: "Filtered out by the graph",
  filteredCaught: "└ later became a candidate anyway",
  filteredMissed: "└ closed without a check signal — a possible miss",
  filteredQuiet: "└ no consequences",
  graphByProject: "Code graph by project",
  graphHead: ["Project", "Graph", "Tasks with source lines", "Symbol found"],
  categoriesTitle: "Categories",
  categoriesEmpty: `No tasks over ${STATS_PERIOD}`,
  categoriesHead: ["Category", "Open", "Weight", "Created", "Closed"],
  categoryUnknown: "unknown",
  originTitle: "Origin",
  foundTitle: "How found",
  foundHead: ["How found", "Created", "Open", "Fixed"],
  foundLabels: { review: "in review", incidental: "incidentally" },
  foundNotRecorded: "not recorded",
  foundUnknown: "unknown",
  branchesTitle: "Branches",
  branchesEmpty: "Branches appear for tasks recorded with backlog new inside a repository",
  branchesHead: ["Branch", "Created", "Open"],

  linesText,
  codeAndTests: ({ deferredLines, deferredTestLines, estimatedLines }) => {
    const approx = isEstimated(estimatedLines);
    return `code ${formatApprox("en", deferredLines - deferredTestLines, approx)}, tests ${formatApprox("en", deferredTestLines, approx)}`;
  },
  keptOut: "Unrelated edits deferred",
  keptOutPending: (fixed) => `fixed ${fixed}; the pending estimate appears after ${MIN_FIXES_FOR_ESTIMATE} fixes`,
  keptOutEstimated: (fixed, pending) => `fixed ${fixed} + pending ${pending}`,
  noiseWithoutBacklog: "Noise without backlog",
  noiseNote: "share of unrelated edits in pull requests",
  deferredToBacklog: "Deferred to backlog",
  deferredNote: (fixed, pending) => `fixed ${fixed}, pending ${pending}`,
  pullRequestLines: "Lines in pull requests",
  sinceAdoption: "since the backlog was adopted",
  chartScale: "Chart scale",
  grainWeek: "week",
  grainDay: "day",
  effectTitle: "Effectiveness",
  byProject: "By project",
  projectsHead: ["Project", "Tasks deferred", "Lines fixed", "Pending estimate", "Lines in pull requests", "Noise without backlog"],
  inPullRequests: "in pull requests",
  deferredSeries: "deferred to backlog",
  codeLines: "code",
  testLines: "tests",
  deferredTasks: "tasks deferred",
  effectSummary: (realLines, deferred, noise) => `Since the backlog was adopted: ${countEn(realLines, "line", "lines")} in pull requests, deferred ${deferred}, noise without backlog ${noise}`,
  explainerTitle: "How the gain is calculated",
  explainerTask: "Every task recorded during work is an edit the agent would have made in the current pull request without the backlog. The gain is the lines that did not get there.",
  explainerFixed:
    "Fixed ones are exact: lines of the commit from the close reason, without lock files, docs and images; a commit for several tasks is split evenly. Tasks closed without a fix and fixed ones without a found commit are not counted.",
  explainerPending: `Pending ones are estimated: the median of fixes in the same category (if there are at least ${MIN_FIXES_FOR_ESTIMATE}), otherwise of all fixes.`,
  explainerTests: "Code and tests: test files are *.test.*, *.spec.*, *_test.*, test_*.py and the test, tests, __tests__, e2e, spec folders. For pending ones, the share of tests in the same fixes.",
  explainerNoise: `Noise without backlog = deferred ÷ (lines in pull requests + pending estimate); fixes are already inside pull requests and are not counted twice. The window starts when the backlog was adopted in the project, no earlier than ${STATS_PERIOD} ago.`,
  now: "Now:",
  fixedNow: (fixedTasks, fixedLines) => `${tasks(fixedTasks)} — ${linesText(fixedLines, false)}`,
  noPending: "nothing pending",
  pendingWithoutEstimate: (openTasks) => `${tasks(openTasks)}, ${ESTIMATE_LATER}`,
  pendingEstimated: (openTasks, estimatedLines, perTask) => `${tasks(openTasks)} ${linesText(estimatedLines, true)}, on average ≈${NBSP}${formatLines("en", perTask)} per task`,
  estimateLater: ESTIMATE_LATER,
  noCommitsSinceAdoption: "no commits since adoption",

  scanStarting: "Counting usage from Claude Code transcripts…",
  noTranscripts: "No Claude Code transcripts found.",
  scanProgress: (done, total) => `Counting usage from Claude Code transcripts: read ${done} of ${countEn(total, "file", "files")}`,
  costNote:
    "Tokens come from Claude Code transcripts: turns started by the backlog Stop hook are exact; output of backlog commands and the skill is estimated by text length. Money is at Claude API prices, a subscription may cost differently.",
  backlogTokens: "Tokens due to the backlog",
  backlogTokensNote: (hook, cli) => `hook turns ${hook}, CLI output and skill ${cli}`,
  apiPrice: "At API prices",
  unpricedNote: "excluding models with unknown prices",
  hookTurns: "Turns due to the hook",
  hookRunsNote: (runs) => `hook runs ${runs}`,
  cliCalls: "CLI calls",
  byModel: "By model",
  noModels: "No models yet",
  modelsHead: ["Model", "Tokens", "At API prices"],
  fastModel: (model) => `${model} (fast mode)`,
  commandsTitle: "Commands",
  noCommands: "No commands yet",
  commandsHead: ["Command", "Runs", "Average time", "Average memory", "Peak memory"],
  megabytes: (value) => (value === null ? "—" : `${formatDecimal("en", value)}${NBSP}MB`),
  milliseconds: (value) => `${formatLines("en", value)}${NBSP}ms`,
  spendByDay: "Usage by day",
  hookTurnTokens: "hook turn tokens",
  cliOutputTokens: "CLI output and skill tokens",
  hookRuns: "hook runs",
  otherCommands: "other commands",
  hookTurnsTooltip: "hook turns",
  cliOutput: "CLI output and skill",
  apiPriceTooltip: "at API prices",
  tokens,
  spendSummary: ({ dayCount, hookTokens, cliTokens, money, hookRuns, cliRuns }) =>
    `Over ${countEn(dayCount, "day", "days")}: due to the hook ${tokens(hookTokens)}, CLI output and skill ${cliTokens}, ≈${NBSP}${money}; hook runs ${hookRuns}, other commands ${cliRuns}`,
  serverMemory: "Server memory",
  memoryRestartNote: "The history starts over after the server restarts",
  memorySummary: (current, max) => `Now ${current}, peak over the last hour ${max}`,
  processMemory: "process memory",
  jsHeap: "JavaScript heap",
};
