import { DAYS_PER_WEEK, formatLocalDay, formatLocalIso } from "../../model/dates";
import type { CliRun } from "../../store/runs";
import type { CostCommand, CostDay, CostModel, CostNumbers, CostPeriod, CostReport, CostTotals, ScanProgress } from "../types";
import { totalTokens } from "./token-counts";
import { COST_REPORT_DAYS, type UsageBucket } from "./usage-state";
import { HOOK_STOP_COMMAND } from "../../hook-signature";
import { costOf, splitFastModel } from "./pricing";
import { dayRange } from "../days";
import { statsPeriod, weekWindows } from "../weeks";
import type { Period } from "../period";
import { groupBy, sum } from "../numbers";
import { lastDays, reportPeriod } from "../report-periods";

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
  const weeks = weekWindows(now);

  return {
    periods: { weeks: reportPeriod(statsPeriod(now)), days: lastDays(now, COST_REPORT_DAYS), totals: lastDays(now, COST_TOTALS_DAYS) },
    scan,
    since: sinceWithin(scopedBuckets, statsPeriod(now)),
    totals: totalsOf(inDays(bucketsByDay, totalsDays), inDays(runsByDay, totalsDays)),
    days: days.map((day) => dayRow(day, bucketsByDay.get(day) ?? [], runsByDay.get(day) ?? [])),
    weeks: weeks.map((week) => {
      const weekDays = daysOf(week);
      return periodRow(formatLocalIso(new Date(week.from)), inDays(bucketsByDay, weekDays), inDays(runsByDay, weekDays));
    }),
    models: modelsOf(inDays(bucketsByDay, days)),
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

function daysOf(week: Period): string[] {
  const monday = new Date(week.from);
  return dayRange(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + DAYS_PER_WEEK - 1), DAYS_PER_WEEK);
}

function localDay(at: string): string {
  const moment = Date.parse(at);
  return Number.isNaN(moment) ? "" : formatLocalDay(new Date(moment));
}

function tokensTotalOf(buckets: readonly UsageBucket[]): number {
  return sum(buckets.map((bucket) => totalTokens(bucket.tokens)));
}

function costOfBuckets(buckets: readonly UsageBucket[]): number | null {
  if (tokensTotalOf(buckets) === 0) return 0;
  const priced = buckets.flatMap((bucket) => {
    const cost = costOf(bucket.model, bucket.tokens);
    return cost === null ? [] : [{ cost, tokens: totalTokens(bucket.tokens) }];
  });
  return sum(priced.map((entry) => entry.tokens)) === 0 ? null : sum(priced.map((entry) => entry.cost));
}

function hasUnpricedTokens(buckets: readonly UsageBucket[]): boolean {
  return buckets.some((bucket) => totalTokens(bucket.tokens) > 0 && costOf(bucket.model, bucket.tokens) === null);
}

function sinceOf(buckets: readonly UsageBucket[]): string | null {
  const days = buckets.map((bucket) => localDay(bucket.slot)).filter((day) => day !== "");
  return days.length === 0 ? null : days.reduce((earliest, day) => (day < earliest ? day : earliest));
}

function sinceWithin(buckets: readonly UsageBucket[], window: Period): string | null {
  return sinceOf(buckets.filter((bucket) => window.contains(Date.parse(bucket.slot))));
}

function totalsOf(buckets: readonly UsageBucket[], runs: readonly CliRun[]): CostTotals {
  return { tokens: tokensTotalOf(buckets), ...costNumbers(buckets, runs) };
}

function runCounts(runs: readonly CliRun[]): { cliRuns: number; hookRuns: number } {
  const hookRuns = runs.filter((run) => run.command === HOOK_STOP_COMMAND).length;
  return { cliRuns: runs.length - hookRuns, hookRuns };
}

function costNumbers(buckets: readonly UsageBucket[], runs: readonly CliRun[]): CostNumbers {
  const hookBuckets = buckets.filter((bucket) => bucket.kind === "hook");
  const cliBuckets = buckets.filter((bucket) => bucket.kind === "cli" || bucket.kind === "skill");
  return {
    hookTokens: tokensTotalOf(hookBuckets),
    cliTokens: tokensTotalOf(cliBuckets),
    cost: costOfBuckets(buckets),
    hasUnpricedTokens: hasUnpricedTokens(buckets),
    hookTurns: sum(buckets.map((bucket) => bucket.hookTurns)),
    ...runCounts(runs),
  };
}

function dayRow(day: string, dayBuckets: readonly UsageBucket[], dayRuns: readonly CliRun[]): CostDay {
  return { day, ...costNumbers(dayBuckets, dayRuns) };
}

function periodRow(start: string, periodBuckets: readonly UsageBucket[], periodRuns: readonly CliRun[]): CostPeriod {
  return { start, ...costNumbers(periodBuckets, periodRuns) };
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
