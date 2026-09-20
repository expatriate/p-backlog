import { formatLocalDay } from "../../model/dates";
import type { CliRun, CostCommand, CostDay, CostModel, CostReport, CostTotals, ScanProgress, TokenCounts, UsageBucket } from "../types";
import { costOf } from "./pricing";

export const COST_REPORT_DAYS = 30;
export const COST_TOTALS_DAYS = 7;
const HOOK_COMMAND = "hook stop";

export type CostInput = {
  buckets: readonly UsageBucket[];
  runs: readonly CliRun[];
  projectOf: (cwd: string) => string | null;
  projectId?: string;
  now: Date;
  scan: ScanProgress;
};

export function costReport({ buckets, runs, projectOf, projectId, now, scan }: CostInput): CostReport {
  const projectOfCwd = memoizedByCwd(projectOf);
  const inScope = (cwd: string) => projectId === undefined || projectOfCwd(cwd) === projectId;
  const scopedBuckets = buckets.filter((bucket) => inScope(bucket.cwd));
  const scopedRuns = runs.filter((run) => inScope(run.cwd));

  const days = dayRange(now, COST_REPORT_DAYS);
  const dayWindow = new Set(days);
  const totalsWindow = new Set(days.slice(-COST_TOTALS_DAYS));
  const runsInWindow = scopedRuns.filter((run) => dayWindow.has(localDay(run.at)));

  return {
    scan,
    since: sinceOf(scopedBuckets),
    totals: totalsOf(
      scopedBuckets.filter((bucket) => totalsWindow.has(bucket.day)),
      runsInWindow.filter((run) => totalsWindow.has(localDay(run.at))),
    ),
    days: days.map((day) => dayRow(day, scopedBuckets, runsInWindow)),
    models: modelsOf(scopedBuckets),
    commands: commandsOf(runsInWindow),
  };
}

function memoizedByCwd(projectOf: (cwd: string) => string | null): (cwd: string) => string | null {
  const known = new Map<string, string | null>();
  return (cwd) => {
    if (!known.has(cwd)) known.set(cwd, projectOf(cwd));
    return known.get(cwd) ?? null;
  };
}

function dayRange(now: Date, count: number): string[] {
  return Array.from({ length: count }, (_, index) => formatLocalDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (count - 1 - index))));
}

function localDay(at: string): string {
  return formatLocalDay(new Date(at));
}

function tokenSum(tokens: TokenCounts): number {
  return tokens.input + tokens.cacheWrite5m + tokens.cacheWrite1h + tokens.cacheRead + tokens.output;
}

function tokensTotalOf(buckets: readonly UsageBucket[]): number {
  return buckets.reduce((sum, bucket) => sum + tokenSum(bucket.tokens), 0);
}

function costOfBuckets(buckets: readonly UsageBucket[]): number | null {
  if (tokensTotalOf(buckets) === 0) return 0;
  let sum = 0;
  let knownTokens = 0;
  for (const bucket of buckets) {
    const cost = costOf(bucket.model, bucket.tokens);
    if (cost === null) continue;
    sum += cost;
    knownTokens += tokenSum(bucket.tokens);
  }
  return knownTokens === 0 ? null : sum;
}

function sinceOf(buckets: readonly UsageBucket[]): string | null {
  const days = buckets.map((bucket) => bucket.day).filter((day) => day !== "");
  return days.length === 0 ? null : days.reduce((earliest, day) => (day < earliest ? day : earliest));
}

function totalsOf(buckets: readonly UsageBucket[], runs: readonly CliRun[]): CostTotals {
  return {
    tokens: tokensTotalOf(buckets),
    cost: costOfBuckets(buckets),
    hookTurns: buckets.reduce((sum, bucket) => sum + bucket.hookTurns, 0),
    cliRuns: runs.filter((run) => run.command !== HOOK_COMMAND).length,
    hookRuns: runs.filter((run) => run.command === HOOK_COMMAND).length,
  };
}

function dayRow(day: string, buckets: readonly UsageBucket[], runs: readonly CliRun[]): CostDay {
  const dayBuckets = buckets.filter((bucket) => bucket.day === day);
  const dayRuns = runs.filter((run) => localDay(run.at) === day);
  const hookBuckets = dayBuckets.filter((bucket) => bucket.kind === "hook");
  const cliBuckets = dayBuckets.filter((bucket) => bucket.kind === "cli" || bucket.kind === "skill");
  return {
    day,
    hookTokens: tokensTotalOf(hookBuckets),
    cliTokens: tokensTotalOf(cliBuckets),
    cost: costOfBuckets(dayBuckets),
    hookTurns: dayBuckets.reduce((sum, bucket) => sum + bucket.hookTurns, 0),
    cliRuns: dayRuns.filter((run) => run.command !== HOOK_COMMAND).length,
    hookRuns: dayRuns.filter((run) => run.command === HOOK_COMMAND).length,
  };
}

function modelsOf(buckets: readonly UsageBucket[]): CostModel[] {
  const byModel = new Map<string, UsageBucket[]>();
  for (const bucket of buckets) byModel.set(bucket.model, [...(byModel.get(bucket.model) ?? []), bucket]);
  return [...byModel.entries()]
    .map(([model, modelBuckets]) => ({ model, tokens: tokensTotalOf(modelBuckets), cost: costOfBuckets(modelBuckets) }))
    .filter((row) => row.tokens > 0)
    .sort((a, b) => b.tokens - a.tokens);
}

function commandsOf(runs: readonly CliRun[]): CostCommand[] {
  const byCommand = new Map<string, CliRun[]>();
  for (const run of runs) byCommand.set(run.command, [...(byCommand.get(run.command) ?? []), run]);
  return [...byCommand.entries()]
    .map(([command, commandRuns]) => ({
      command,
      runs: commandRuns.length,
      avgMs: average(commandRuns.map((run) => run.ms)),
      avgRssMb: average(commandRuns.map((run) => run.rssMb)),
      maxRssMb: Math.max(...commandRuns.map((run) => run.rssMb)),
    }))
    .sort((a, b) => b.runs - a.runs);
}

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
