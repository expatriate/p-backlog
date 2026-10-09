import { formatLocalDay, formatLocalIso } from "../../model/dates";
import type { CliRun } from "../../store/runs";
import type { CostCommand, CostDay, CostModel, CostNumbers, CostPeriod, CostReport, CostTotals, ScanProgress } from "../types";
import { totalTokens } from "./token-counts";
import type { UsageBucket } from "./usage-state";
import { HOOK_STOP_COMMAND } from "../../hook-signature";
import { SERVE_COMMAND_NAME } from "../../serve-command";
import { costOf, splitFastModel } from "./pricing";
import { dayWindows, STATS_DAYS } from "../days";
import { statsPeriod, weekWindows } from "../weeks";
import type { Period } from "../period";
import { smallest, sum } from "../../numbers";
import { groupBy } from "../../collections";
import { grainPeriods, lastDays, lastDaysPeriod } from "../report-periods";
import { remembered } from "../../remembered";
import { inProjectScope } from "../scope";

export const COST_TOTALS_DAYS = 7;

export type CostInput = {
  buckets: readonly UsageBucket[];
  runs: readonly CliRun[];
  projectOf: (cwd: string) => string | null;
  projectId?: string | undefined;
  now: Date;
  scan: ScanProgress;
};

type UsageInPeriod = { buckets: UsageBucket[]; runs: CliRun[] };

type Timed<T> = { item: T; at: number };

export function costReport({ buckets, runs, projectOf, projectId, now, scan }: CostInput): CostReport {
  const projectByCwd = new Map<string, string | null>();
  const projectOfCwd = (cwd: string) => remembered(projectByCwd, cwd, () => projectOf(cwd));
  const scopedBuckets = inProjectScope(buckets, projectId, (bucket) => projectOfCwd(bucket.cwd));
  const scopedRuns = inProjectScope(
    runs.filter((run) => run.command !== SERVE_COMMAND_NAME),
    projectId,
    (run) => projectOfCwd(run.cwd),
  );
  const timedBuckets = timed(scopedBuckets, (bucket) => bucket.slot);
  const timedRuns = timed(scopedRuns, (run) => run.at);
  const within = (period: Period): UsageInPeriod => ({ buckets: itemsWithin(timedBuckets, period), runs: itemsWithin(timedRuns, period) });
  const reported = within(lastDaysPeriod(now, STATS_DAYS));

  return {
    periods: { ...grainPeriods(now), totals: lastDays(now, COST_TOTALS_DAYS) },
    scan,
    since: sinceOf(timedBuckets, statsPeriod(now)),
    totals: totalsOf(within(lastDaysPeriod(now, COST_TOTALS_DAYS))),
    days: dayWindows(now).map((day): CostDay => ({ day: formatLocalDay(new Date(day.from)), ...costNumbers(within(day)) })),
    weeks: weekWindows(now).map((week): CostPeriod => ({ start: formatLocalIso(new Date(week.from)), ...costNumbers(within(week)) })),
    models: modelsOf(reported.buckets),
    commands: commandsOf(reported.runs),
  };
}

function timed<T>(items: readonly T[], momentOf: (item: T) => string): Timed<T>[] {
  return items.map((item) => ({ item, at: Date.parse(momentOf(item)) }));
}

function itemsWithin<T>(timedItems: readonly Timed<T>[], period: Period): T[] {
  return timedItems.filter(({ at }) => period.contains(at)).map(({ item }) => item);
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

function sinceOf(timedBuckets: readonly Timed<UsageBucket>[], period: Period): string | null {
  const earliest = smallest(timedBuckets.map(({ at }) => at).filter((at) => period.contains(at)));
  return earliest === null ? null : formatLocalDay(new Date(earliest));
}

function totalsOf(usage: UsageInPeriod): CostTotals {
  return { tokens: tokensTotalOf(usage.buckets), ...costNumbers(usage) };
}

function runCounts(runs: readonly CliRun[]): { cliRuns: number; hookRuns: number } {
  const hookRuns = runs.filter((run) => run.command === HOOK_STOP_COMMAND).length;
  return { cliRuns: runs.length - hookRuns, hookRuns };
}

function costNumbers({ buckets, runs }: UsageInPeriod): CostNumbers {
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
