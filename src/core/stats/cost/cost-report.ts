import { formatLocalDay } from "../../model/dates";
import type { CliRun, CostCommand, CostDay, CostModel, CostReport, CostTotals, ScanProgress, TokenCounts, UsageBucket } from "../types";
import { HOOK_STOP_COMMAND } from "./hook-signature";
import { costOf, splitFastModel } from "./pricing";
import { dayRange } from "../days";
import { groupBy, sum } from "../numbers";

const COST_REPORT_DAYS = 30;
export const COST_TOTALS_DAYS = 7;

export type CostInput = {
  buckets: readonly UsageBucket[];
  runs: readonly CliRun[];
  projectOf: (cwd: string) => string | null;
  projectId?: string | undefined;
  now: Date;
  scan: ScanProgress;
};

export function costReport({ buckets, runs, projectOf, projectId, now, scan }: CostInput): CostReport {
  const projectOfCwd = memoizedByCwd(projectOf);
  const inScope = (cwd: string) => projectId === undefined || projectOfCwd(cwd) === projectId;
  const scopedBuckets = buckets.filter((bucket) => inScope(bucket.cwd));
  const scopedRuns = runs.filter((run) => inScope(run.cwd));

  const days = dayRange(now, COST_REPORT_DAYS);
  const bucketsByDay = groupBy(scopedBuckets, (bucket) => localDay(bucket.slot));
  const runsByDay = groupBy(scopedRuns, (run) => localDay(run.at));
  const inDays = <T>(byDay: ReadonlyMap<string, T[]>, window: readonly string[]) => window.flatMap((day) => byDay.get(day) ?? []);
  const totalsDays = days.slice(-COST_TOTALS_DAYS);

  return {
    scan,
    since: sinceOf(scopedBuckets),
    totals: totalsOf(inDays(bucketsByDay, totalsDays), inDays(runsByDay, totalsDays)),
    days: days.map((day) => dayRow(day, bucketsByDay.get(day) ?? [], runsByDay.get(day) ?? [])),
    models: modelsOf(scopedBuckets),
    commands: commandsOf(inDays(runsByDay, days)),
  };
}

function memoizedByCwd(projectOf: (cwd: string) => string | null): (cwd: string) => string | null {
  const known = new Map<string, string | null>();
  return (cwd) => {
    if (!known.has(cwd)) known.set(cwd, projectOf(cwd));
    return known.get(cwd) ?? null;
  };
}

function localDay(at: string): string {
  const moment = Date.parse(at);
  return Number.isNaN(moment) ? "" : formatLocalDay(new Date(moment));
}

function tokenSum(tokens: TokenCounts): number {
  return tokens.input + tokens.cacheWrite5m + tokens.cacheWrite1h + tokens.cacheRead + tokens.output;
}

function tokensTotalOf(buckets: readonly UsageBucket[]): number {
  return sum(buckets.map((bucket) => tokenSum(bucket.tokens)));
}

function costOfBuckets(buckets: readonly UsageBucket[]): number | null {
  if (tokensTotalOf(buckets) === 0) return 0;
  const priced = buckets.flatMap((bucket) => {
    const cost = costOf(bucket.model, bucket.tokens);
    return cost === null ? [] : [{ cost, tokens: tokenSum(bucket.tokens) }];
  });
  return sum(priced.map((entry) => entry.tokens)) === 0 ? null : sum(priced.map((entry) => entry.cost));
}

function sinceOf(buckets: readonly UsageBucket[]): string | null {
  const days = buckets.map((bucket) => localDay(bucket.slot)).filter((day) => day !== "");
  return days.length === 0 ? null : days.reduce((earliest, day) => (day < earliest ? day : earliest));
}

function totalsOf(buckets: readonly UsageBucket[], runs: readonly CliRun[]): CostTotals {
  return {
    tokens: tokensTotalOf(buckets),
    cost: costOfBuckets(buckets),
    hasUnpricedTokens: buckets.some((bucket) => tokenSum(bucket.tokens) > 0 && costOf(bucket.model, bucket.tokens) === null),
    hookTurns: sum(buckets.map((bucket) => bucket.hookTurns)),
    cliRuns: runs.filter((run) => run.command !== HOOK_STOP_COMMAND).length,
    hookRuns: runs.filter((run) => run.command === HOOK_STOP_COMMAND).length,
  };
}

function dayRow(day: string, dayBuckets: readonly UsageBucket[], dayRuns: readonly CliRun[]): CostDay {
  const hookBuckets = dayBuckets.filter((bucket) => bucket.kind === "hook");
  const cliBuckets = dayBuckets.filter((bucket) => bucket.kind === "cli" || bucket.kind === "skill");
  return {
    day,
    hookTokens: tokensTotalOf(hookBuckets),
    cliTokens: tokensTotalOf(cliBuckets),
    cost: costOfBuckets(dayBuckets),
    hookTurns: sum(dayBuckets.map((bucket) => bucket.hookTurns)),
    cliRuns: dayRuns.filter((run) => run.command !== HOOK_STOP_COMMAND).length,
    hookRuns: dayRuns.filter((run) => run.command === HOOK_STOP_COMMAND).length,
  };
}

function modelsOf(buckets: readonly UsageBucket[]): CostModel[] {
  return [...groupBy(buckets, (bucket) => bucket.model).entries()]
    .map(([key, modelBuckets]) => ({ ...splitFastModel(key), tokens: tokensTotalOf(modelBuckets), cost: costOfBuckets(modelBuckets) }))
    .filter((row) => row.tokens > 0)
    .sort((a, b) => b.tokens - a.tokens);
}

function commandsOf(runs: readonly CliRun[]): CostCommand[] {
  return [...groupBy(runs, (run) => run.command).entries()]
    .map(([command, commandRuns]) => ({
      command,
      runs: commandRuns.length,
      avgMs: average(commandRuns.map((run) => run.ms)),
      avgRssMb: average(commandRuns.map((run) => run.rssMb)),
      maxRssMb: commandRuns.reduce((most, run) => Math.max(most, run.rssMb), 0),
    }))
    .sort((a, b) => b.runs - a.runs);
}

function average(values: readonly number[]): number {
  return sum(values) / values.length;
}
