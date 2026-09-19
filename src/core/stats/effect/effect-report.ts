import { formatLocalIso } from "../../model/dates";
import { isClosed } from "../../model/graph";
import type { TaskCategory } from "../../model/types";
import { fixCommitOf } from "../code/fixes";
import { closingsOf, type TaskHistory } from "../history";
import { median } from "../numbers";
import { statsScope, type StatsInput } from "../scope";
import type { CollectedCode, CommitUnit, EffectProject, EffectReport, EffectTotals, EffectWeek } from "../types";
import { periodStart, STATS_WEEKS, weekStarts } from "../weeks";

const MIN_FIXES_FOR_ESTIMATE = 5;

export type EffectInput = StatsInput & { code: CollectedCode };

type Deferred = { history: TaskHistory; fixedLines: number | null };
type Estimate = (category: TaskCategory | undefined) => number | null;

export function effectReport({ code, ...input }: EffectInput): EffectReport {
  const { now, projectId } = input;
  const scope = statsScope(input);
  const histories = scope.histories.filter((history) => history.type === "task");
  const from = periodStart(now);
  const to = now.getTime();
  const inPeriod = (moment: number) => moment >= from && moment <= to;
  const projects = code.projects.filter((project) => project.repos.length > 0 && (projectId === undefined || project.projectId === projectId));
  const deferred = histories.filter((history) => inPeriod(history.createdAt)).flatMap((history) => deferredOf(history, code));
  const estimate = estimator(histories.flatMap((history) => fixSize(history, code)));
  const units = (id?: string) =>
    projects.filter((project) => id === undefined || project.projectId === id).flatMap((project) => project.repos.flatMap((repo) => repo.units)).filter((unit) => inPeriod(Date.parse(unit.date)));
  const totals = totalsOf(deferred, units(), estimate);
  return {
    taskCount: histories.length,
    journalSince: scope.journalSince,
    invalidJournalLines: scope.invalidJournalLines,
    unavailableRepos: code.unavailableRepos,
    totals,
    weeks: weeksOf(deferred, units(), estimate, now),
    projects: projects.map((project): EffectProject => {
      const own = totalsOf(deferred.filter((item) => item.history.projectId === project.projectId), units(project.projectId), estimate);
      return {
        projectId: project.projectId,
        name: project.name,
        realLines: own.realLines,
        deferredTasks: own.fixedTasks + own.openTasks,
        fixedLines: own.fixedLines,
        estimatedLines: own.estimatedLines,
        noiseShare: own.noiseShare,
      };
    }),
  };
}

function deferredOf(history: TaskHistory, code: CollectedCode): Deferred[] {
  if (!isClosed(history.finalStatus)) return [{ history, fixedLines: null }];
  const size = fixSize(history, code);
  return size.length === 0 ? [] : [{ history, fixedLines: size[0]?.lines ?? 0 }];
}

function fixSize(history: TaskHistory, code: CollectedCode): { category: TaskCategory | undefined; lines: number }[] {
  if (!isClosed(history.finalStatus) || closingsOf(history).at(-1)?.resolution !== "fixed") return [];
  const commit = fixCommitOf(history, code.fixCommits);
  return commit === undefined ? [] : [{ category: history.category, lines: commit.lines }];
}

function estimator(sizes: readonly { category: TaskCategory | undefined; lines: number }[]): Estimate {
  const overall = sizes.length >= MIN_FIXES_FOR_ESTIMATE ? median(sizes.map((size) => size.lines)) : null;
  return (category) => {
    const own = sizes.filter((size) => size.category === category).map((size) => size.lines);
    return own.length >= MIN_FIXES_FOR_ESTIMATE ? median(own) : overall;
  };
}

function totalsOf(deferred: readonly Deferred[], units: readonly CommitUnit[], estimate: Estimate): EffectTotals {
  const fixed = deferred.flatMap((item) => (item.fixedLines === null ? [] : [item.fixedLines]));
  const open = deferred.filter((item) => item.fixedLines === null);
  const estimatedLines = estimatedLinesOf(open, estimate);
  const realLines = units.reduce((sum, unit) => sum + unit.lines, 0);
  const fixedLines = fixed.reduce((sum, lines) => sum + lines, 0);
  const deferredLines = fixedLines + (estimatedLines ?? 0);
  return {
    realLines,
    fixedTasks: fixed.length,
    fixedLines,
    openTasks: open.length,
    estimatedLines,
    deferredLines,
    noiseShare: realLines + deferredLines === 0 ? null : deferredLines / (realLines + deferredLines),
  };
}

function estimatedLinesOf(open: readonly Deferred[], estimate: Estimate): number | null {
  if (open.length === 0) return 0;
  const estimates = open.map((item) => estimate(item.history.category));
  return estimates.some((value) => value === null) ? null : estimates.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

function weeksOf(deferred: readonly Deferred[], units: readonly CommitUnit[], estimate: Estimate, now: Date): EffectWeek[] {
  const starts = weekStarts(now, STATS_WEEKS);
  return starts.map((start, index) => {
    const end = starts[index + 1]?.getTime() ?? now.getTime() + 1;
    const inWeek = (moment: number) => moment >= start.getTime() && moment < end;
    const own = deferred.filter((item) => inWeek(item.history.createdAt));
    const totals = totalsOf(own, units.filter((unit) => inWeek(Date.parse(unit.date))), estimate);
    return { start: formatLocalIso(start), realLines: totals.realLines, deferredLines: totals.deferredLines, deferredTasks: own.length };
  });
}
