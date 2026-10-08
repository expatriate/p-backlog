import { formatDecimal } from "../../core/i18n/format";
import { countEn, NBSP, pluralEn } from "../../core/i18n/plural";
import type { ChartStep, Grain } from "./charts/chart-style";
import type { StatsMessages } from "./messages.ru";
import type { StatsConstants } from "./stats-constants";
import type { LinesAmount } from "./summaries";

const dayCount = (n: number): string => countEn(n, "day", "days");
const CHART_STEPS: Record<ChartStep, string> = { day: "day", week: "week", sample: "sample" };

const PERIOD_FORMS: Record<Grain, [string, string]> = { week: ["week", "weeks"], day: ["day", "days"] };
const PER_PERIOD: Record<Grain, string> = { week: "a week", day: "a day" };
const LAST_PERIOD: Record<Grain, string> = { week: "in the latest week with decisions", day: "on the last day with decisions" };

const periods = (grain: Grain, n: number): string => countEn(n, ...PERIOD_FORMS[grain]);
const tasks = (n: number): string => countEn(n, "task", "tasks");
const tokens = (n: number): string => countEn(n, "token", "tokens");

function linesText({ formatted, count }: LinesAmount): string {
  return `${formatted}${NBSP}${pluralEn(count, "line", "lines")}`;
}

export function createStatsEn(constants: StatsConstants): StatsMessages {
  const churnPeriod = dayCount(constants.churnDays);
  const statsPeriod = countEn(constants.statsWeeks, "week", "weeks");
  const memoryHistoryPeriod = countEn(constants.memoryHistoryHours, "hour", "hours");
  const effectWindow = `${statsPeriod} (since adoption, if later)`;
  const estimateLater = `the estimate appears after ${constants.minFixesForEstimate} fixes`;

  return {
    docTitle: (heading) => `${heading} — Backlog`,
    heading: (scopeName) => `Statistics · ${scopeName}`,
    alerts: "Alerts",
    tabsLabel: "Statistics sections",
    tabs: { overview: "Overview", code: "Code", quality: "Quality", effect: "Effect", cost: "Cost" },

    invalidJournalLines: (n) => `Could not parse journal lines: ${n}. They are left out of the statistics — check the line format in the project's journal.jsonl.`,
    unknownJournalLines: (n) => `Journal lines with an unknown value: ${n}. A renamed value (category, how found, resolution) is shown as "unknown", but is counted in the breakdowns.`,
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

    periodWindows: { weeks: statsPeriod, days: dayCount(constants.statsDays), lastWeek: dayCount(constants.costTotalsDays), churn: churnPeriod },
    periodCaption: (window, range) => `${window} · ${range}`,
    periodNow: "now",
    chartLabel: (name, step) => `${name}. Left and right arrows move by ${CHART_STEPS[step]}`,
    periodOf: (grain, day) => (grain === "week" ? `week of ${day}` : day),
    weekTrend: (arrow, size) => `${arrow}${NBSP}${size}${NBSP}vs${NBSP}last${NBSP}week`,
    weekTrendSpeech: {
      decline: (size) => `${size} less than a week ago — better`,
      growth: (size) => `${size} more than a week ago — worse`,
    },

    tasksToday: "Tasks today",
    createdAndClosed: "created and closed",
    thisWeek: "This week",
    weekNote: (created, closed) => `created ${created}, closed ${closed}`,
    debtBy: { week: "Debt by week", day: "Debt by day" },
    flowCreated: "created",
    flowClosed: "closed",
    flowOpen: "open",
    flowOpenAtEnd: { week: "open at week end", day: "open at day end" },
    flowSummary: ({ grain, periodCount, created, closed, openNow }) => `${periods(grain, periodCount)}: created ${created}, closed ${closed}, open now ${openNow}`,
    createdBy: { week: "Created by week", day: "Created by day" },
    createdTasks: "tasks created",
    intakeSummary: ({ grain, periodCount, created, perPeriod }) => {
      const period = periods(grain, periodCount);
      if (perPeriod === null) return `${period}: no tasks created`;
      return `${period}: created ${created}, on average ${formatDecimal("en", perPeriod)} ${PER_PERIOD[grain]}`;
    },
    hotspots: "Where it hurts",
    noSourceFolders: "Open tasks have no source",
    tags: "Tags",
    noTags: "Open tasks have no tags",
    openAge: "Age of open tasks",
    ageBuckets: { week: "up to 7 days", month: "7–30 days", quarter: "30–90 days", older: "over 90 days" },
    priorityCounts: { critical: "critical", high: "high", medium: "medium", low: "low" },
    urgentStale: (n) => `Critical and high older than ${constants.staleUrgentDays} days: ${n}`,
    closing: "How tasks close",
    closingReasons: { done: "done", cancelled: "cancelled", unknown: "resolution not recognized" },
    noiseAndReopens: "Noise and reopens",
    duplicatesAmongClosed: "Duplicates among closed",
    noSourceAmongCreated: "No source among created",
    reopened: "Reopened",

    codeNote: `Changes are commits over ${churnPeriod}; lines are at the latest commit.`,
    churnTitle: "Debt in frequently changed code",
    churnHint: `Rank is commits over ${churnPeriod} × weight of the folder's open tasks`,
    churnEmpty: `No debt lies in code changed over ${churnPeriod}`,
    commits: (n) => countEn(n, "commit", "commits"),
    churnTasks: (n, weight) => `${tasks(n)}, weight ${weight}`,
    densityTitle: "Debt density",
    perKloc: (value) => `${formatDecimal("en", value)} per 1000${NBSP}lines`,

    accuracyTitle: "Check precision",
    noCandidates: "The check has not found any candidates yet",
    accuracyHint: "Share of check candidates after which the task was closed; the rest were confirmed as still relevant",
    accuracyTable: (period) => `Check precision, ${period}`,
    accuracyHead: ["Evidence", "Candidates", "Closed", "Confirmed", "Undecided", "Precision"],
    splitRow: (label) => `└ of them ${label}`,
    beforeMethodRecorded: "before the method was recorded",
    checkedBy: (method) => `checked ${method}`,
    beforeMatchRecorded: "before the match was recorded",
    matchedBy: (match) => `matched ${match}`,
    decidedCandidates: "candidates decided",
    precision: "precision",
    accuracySummary: ({ grain, periodCount, decided, latestPrecision }) =>
      latestPrecision === null ? `${periods(grain, periodCount)}: no decided candidates` : `${periods(grain, periodCount)}: decided ${decided}, precision ${LAST_PERIOD[grain]} ${latestPrecision}`,
    graphTitle: "Code graph",
    graphMissing: (code) => ["No code graph: the check compares source lines and the whole file. ", code("code-review-graph build"), " in the project repository enables the check by symbol"],
    graphHint: 'The graph drops the "code changed" candidate when an edit touched another symbol of the same file, so the agent does not have to re-read the task',
    filteredTitle: `Filtered out over ${statsPeriod}`,
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
    categoriesEmpty: `No tasks over ${statsPeriod}`,
    categoriesHead: ["Category", "Open", "Weight", "Created", "Closed"],
    originTitle: "Origin",
    foundTitle: "How found",
    foundHead: ["How found", "Created", "Open", "Fixed"],
    foundLabels: { review: "in review", incidental: "incidentally", manual: "manually" },
    foundNotRecorded: "not recorded",
    foundUnknown: "unknown",
    branchesTitle: "Branches",
    branchesEmpty: "Branches appear for tasks recorded with backlog new inside a repository",
    branchesHead: ["Branch", "Created", "Open"],

    linesText,
    codeAndTests: ({ code, tests }) => `code ${code}, tests ${tests}`,
    keptOut: "Unrelated edits deferred",
    keptOutPending: (fixed) => `fixed ${fixed}; the pending estimate appears after ${constants.minFixesForEstimate} fixes`,
    keptOutEstimated: (fixed, pending) => `fixed ${fixed} + pending ${pending}`,
    noiseWithoutBacklog: "Noise without backlog",
    noiseNote: "share of unrelated edits in pull requests",
    deferredToBacklog: "Deferred to backlog",
    deferredNote: (fixed, pending) => `fixed ${fixed}, pending ${pending}`,
    pullRequestLines: "Lines in pull requests",
    effectWindow: `over ${effectWindow}`,
    chartScale: (chart) => `Scale of the "${chart}" chart`,
    chartNames: { flow: "Debt", intake: "Created", accuracy: "Check precision", effect: "Effect", spend: "Usage" },
    grainNames: { week: "week", day: "day" },
    effectTitle: "Effectiveness",
    byProject: "By project",
    projectsHead: ["Project", "Tasks deferred", "Lines fixed", "Pending estimate", "Lines in pull requests", "Noise without backlog"],
    onTopicSeries: "on topic in pull requests",
    deferredSeries: "deferred to backlog",
    codeLines: "code",
    testLines: "tests",
    deferredTasks: "tasks deferred",
    effectSummary: (realLines, deferred, noise) => `Over ${effectWindow}: ${countEn(realLines, "line", "lines")} in pull requests, deferred ${deferred}, noise without backlog ${noise}`,
    effectDaysSummary: (days, onTopicLines, deferred) => `Over ${periods("day", days)}: ${countEn(onTopicLines, "line", "lines")} on topic in pull requests, deferred ${deferred}`,
    noDeferredTasks:
      "No tasks moved out by the agent in passing yet, so there is no gain to measure. The agent records problems outside the current work that it notices itself (backlog new --found incidental); review and audit findings and tasks recorded at the user's request don't count here.",
    explainerTitle: "How the gain is calculated",
    explainerTask:
      "Every task the agent moved out of its work in passing is an edit it would have made in the current pull request without the backlog. The gain is the lines that did not get there. Review and audit findings and tasks recorded at the user's request are not counted — they are shown on the Quality tab under Origin.",
    explainerFixed:
      "Fixed ones are exact: lines of the commit from the close reason, without lock files, docs and images; a commit for several tasks is split evenly. Tasks closed without a fix and fixed ones without a found commit are not counted.",
    explainerPending: `Pending ones are estimated: the median of fixes in the same category (if there are at least ${constants.minFixesForEstimate}), otherwise of all fixes.`,
    explainerTests: `Code and tests: test files are ${constants.testFileGlobs.join(", ")} and the ${constants.testDirectories.join(", ")} folders. For pending ones, the share of tests in the same fixes.`,
    explainerNoise: `Noise without backlog = deferred ÷ (lines in pull requests + pending estimate); fixes are already inside pull requests and are not counted twice. The window starts when the backlog was adopted in the project, no earlier than ${statsPeriod} ago.`,
    now: "Now:",
    fixedNow: (fixedTasks, fixedLines) => `${tasks(fixedTasks)} — ${linesText(fixedLines)}`,
    noPending: "nothing pending",
    pendingWithoutEstimate: (openTasks) => `${tasks(openTasks)}, ${estimateLater}`,
    pendingEstimated: ({ openTasks, estimated, perTask }) => `${tasks(openTasks)} ${linesText(estimated)}, on average ${perTask} per task`,
    estimateLater,
    noCommitsSinceAdoption: "no commits since adoption",
    noiseFormula: (deferred, real, estimated, share) => `${deferred} ÷ (${real} + ${estimated}) ${share}`,

    scanStarting: "Counting usage from Claude Code transcripts…",
    noTranscripts: "No Claude Code transcripts found.",
    scanProgress: (done, total) => `Counting usage from Claude Code transcripts: read ${done} of ${countEn(total, "file", "files")}`,
    costNote:
      "Tokens come from Claude Code transcripts: turns started by the backlog Stop hook are exact; output of backlog commands and the skill is estimated by text length. Money is at Claude API prices, a subscription may cost differently. Costs of other agents (Codex, Cursor) are not counted.",
    backlogTokens: "Tokens due to the backlog",
    backlogTokensNote: (hook, cli) => `hook turns ${hook}, CLI output and skill ${cli}`,
    apiPrice: "At API prices",
    unpricedNote: "excluding models with unknown prices",
    hookTurns: "Turns due to the hook",
    hookRunsNote: (runs) => `hook runs ${runs}`,
    cliCalls: "CLI calls",
    costSince: (date) => `Usage data since ${date}`,
    byModel: "By model",
    noModels: "No models yet",
    modelsHead: ["Model", "Tokens", "At API prices"],
    fastModel: (model) => `${model} (fast mode)`,
    commandsTitle: "Commands",
    noCommands: "No commands yet",
    commandsHead: ["Command", "Runs", "Average time", "Average memory", "Peak memory"],
    megabytes: (value) => `${formatDecimal("en", value)}${NBSP}MB`,
    milliseconds: (amount) => `${amount}${NBSP}ms`,
    spendBy: { week: "Usage by week", day: "Usage by day" },
    hookTurnTokens: "hook turn tokens",
    cliOutputTokens: "CLI output and skill tokens",
    hookRuns: "hook runs",
    otherCommands: "other commands",
    hookTurnsTooltip: "hook turns",
    cliOutput: "CLI output and skill",
    apiPriceTooltip: "at API prices",
    tokens,
    spendSummary: ({ grain, periodCount, hookTokens, cliTokens, approxMoney, hookRuns, cliRuns }) =>
      `Over ${periods(grain, periodCount)}: due to the hook ${tokens(hookTokens)}, CLI output and skill ${cliTokens}, ${approxMoney}; hook runs ${hookRuns}, other commands ${cliRuns}`,
    serverMemory: "Server memory",
    memoryRestartNote: "The history starts over after the server restarts",
    memorySummary: (current, max) => `Now ${current}, peak over ${memoryHistoryPeriod} ${max}`,
    processMemory: "process memory",
    jsHeap: "JavaScript heap",
  };
}
