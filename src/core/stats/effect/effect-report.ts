import { formatLocalIso } from "../../model/dates";
import { isClosed } from "../../model/graph";
import { UNKNOWN, type Recorded } from "../../journal/events";
import type { TaskCategory } from "../../model/types";
import { fixCommitEntry, retainedFixes, type FixCommitEntry } from "../code/fixes";
import { isFixedNow, type TaskHistory } from "../history";
import { countBy, median, smallest, sum } from "../numbers";
import { period, type Period } from "../period";
import { grainPeriods } from "../report-periods";
import { reportBase, type ReportBase, type StatsInput } from "../scope";
import type { CollectedCode, CommitUnit, ProjectCode } from "../../code/types";
import type { EffectProject, EffectReport, EffectTotals, EffectPeriod } from "../types";
import { dayWindows } from "../days";
import { statsPeriod, weekWindows } from "../weeks";

export const MIN_FIXES_FOR_ESTIMATE = 5;

export type EffectInput = StatsInput & { code: CollectedCode };

type Deferred = { history: TaskHistory; fixedLines: number | null; fixedTestLines: number; fixedAt: number | null };
type FixSize = { lines: number; testLines: number };
type FixSample = FixSize & { category: Recorded<TaskCategory> | undefined };
type Estimate = (category: Recorded<TaskCategory> | undefined) => FixSize | null;

export function effectReport(
  { code, ...input }: EffectInput,
  base: ReportBase = reportBase(input),
  wholeBacklog: ReportBase = input.projectId === undefined ? base : reportBase({ ...input, projectId: undefined }),
): EffectReport {
  const { now, projectId } = input;
  const { histories } = base;
  const statsWindow = statsPeriod(now);
  const projects = code.projects.filter((project) => project.repos.length > 0 && (projectId === undefined || project.projectId === projectId));
  const deferredByAgent = histories.filter((history) => history.found === "incidental" && history.foundExplicit && statsWindow.contains(history.createdAt));
  const deferred = buildDeferred(deferredByAgent, retainedFixes(histories, now), code);
  const estimate = estimator(estimateSamples(retainedFixes(wholeBacklog.histories, now), code));
  const adoptionStart = (id: string) => {
    const firstCreated = smallest(histories.filter((history) => history.projectId === id).map((history) => history.createdAt));
    return firstCreated === null ? statsWindow.from : Math.max(statsWindow.from, firstCreated);
  };
  const unitsOf = (project: ProjectCode) => project.repos.flatMap((repo) => repo.units);
  const unitsForTotals = (id?: string) =>
    projects
      .filter((project) => id === undefined || project.projectId === id)
      .flatMap((project) => {
        const adopted = period(adoptionStart(project.projectId), statsWindow.to);
        return unitsOf(project).filter((unit) => adopted.contains(Date.parse(unit.date)));
      });
  const periodUnits = projects.flatMap(unitsOf).filter((unit) => statsWindow.contains(Date.parse(unit.date)));
  return {
    ...base.head,
    periods: grainPeriods(now),
    unavailableRepos: code.unavailableRepos,
    totals: totalsOf(deferred, unitsForTotals(), estimate),
    weeks: bucketsOf(weekWindows(now), deferred, periodUnits, estimate),
    days: bucketsOf(dayWindows(now), deferred, periodUnits, estimate),
    projects: projects.map((project): EffectProject => {
      const own = totalsOf(deferred.filter((item) => item.history.projectId === project.projectId), unitsForTotals(project.projectId), estimate);
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

function fixEntryOf(history: TaskHistory, code: CollectedCode): FixCommitEntry | undefined {
  return isFixedNow(history) ? fixCommitEntry(history, code.fixCommits) : undefined;
}

function buildDeferred(candidates: readonly TaskHistory[], commitSharers: readonly TaskHistory[], code: CollectedCode): Deferred[] {
  const sharersByCommit = countBy(
    commitSharers.flatMap((history) => fixEntryOf(history, code)?.key ?? []),
    (key) => key,
  );
  return candidates.flatMap((history): Deferred[] => {
    if (!isClosed(history.finalStatus)) return [{ history, fixedLines: null, fixedTestLines: 0, fixedAt: null }];
    const entry = fixEntryOf(history, code);
    if (entry === undefined) return [];
    const sharers = sharersByCommit.get(entry.key) ?? 1;
    return [{ history, fixedLines: entry.commit.lines / sharers, fixedTestLines: entry.commit.testLines / sharers, fixedAt: Date.parse(entry.commit.landedAt ?? entry.commit.date) }];
  });
}

function estimateSamples(histories: readonly TaskHistory[], code: CollectedCode): FixSample[] {
  const seen = new Map<string, FixSample>();
  for (const history of histories) {
    const entry = fixEntryOf(history, code);
    if (entry === undefined || seen.has(entry.key)) continue;
    seen.set(entry.key, { category: history.category, lines: entry.commit.lines, testLines: entry.commit.testLines });
  }
  return [...seen.values()];
}

function estimator(samples: readonly FixSample[]): Estimate {
  const overall = sizeOf(samples);
  return (category) => {
    if (category === undefined || category === UNKNOWN) return overall;
    return sizeOf(samples.filter((sample) => sample.category === category)) ?? overall;
  };
}

function sizeOf(samples: readonly FixSample[]): FixSize | null {
  const lines = samples.length < MIN_FIXES_FOR_ESTIMATE ? null : median(samples.map((sample) => sample.lines));
  if (lines === null) return null;
  const totalLines = sum(samples.map((sample) => sample.lines));
  const testShare = totalLines === 0 ? 0 : sum(samples.map((sample) => sample.testLines)) / totalLines;
  return { lines, testLines: lines * testShare };
}

function totalsOf(deferred: readonly Deferred[], units: readonly CommitUnit[], estimate: Estimate): EffectTotals {
  const fixed = deferred.flatMap((item) => (item.fixedLines === null ? [] : [item.fixedLines]));
  const open = deferred.filter((item) => item.fixedLines === null);
  const estimated = estimatedSizeOf(open, estimate);
  const estimatedLines = estimated?.lines ?? null;
  const realLines = sum(units.map((unit) => unit.lines));
  const fixedLines = sum(fixed);
  const deferredLines = fixedLines + (estimatedLines ?? 0);
  const denominator = realLines + (estimatedLines ?? 0);
  return {
    realLines,
    fixedTasks: fixed.length,
    fixedLines,
    openTasks: open.length,
    estimatedLines,
    deferredLines,
    deferredTestLines: sum(deferred.map((item) => item.fixedTestLines)) + (estimated?.testLines ?? 0),
    noiseShare: realLines === 0 || (estimatedLines === null && open.length > 0) ? null : Math.min(1, deferredLines / denominator),
  };
}

function estimatedSizeOf(open: readonly Deferred[], estimate: Estimate): FixSize | null {
  const estimates = open.map((item) => estimate(item.history.category));
  if (estimates.some((size) => size === null)) return null;
  const sizes = estimates.filter((size) => size !== null);
  return { lines: sum(sizes.map((size) => size.lines)), testLines: sum(sizes.map((size) => size.testLines)) };
}

function bucketsOf(windows: readonly Period[], deferred: readonly Deferred[], periodUnits: readonly CommitUnit[], estimate: Estimate): EffectPeriod[] {
  return windows.map((span) => {
    const rawRealLines = sum(periodUnits.filter((unit) => span.contains(Date.parse(unit.date))).map((unit) => unit.lines));
    const fixedInWindow = deferred.filter((item) => item.fixedAt !== null && span.contains(item.fixedAt));
    const openInWindow = deferred.filter((item) => item.fixedLines === null && span.contains(item.history.createdAt));
    const fixedLinesInWindow = sum(fixedInWindow.map((item) => item.fixedLines ?? 0));
    const estimatedInWindow = estimatedSizeOf(openInWindow, estimate);
    const deferredLines = fixedLinesInWindow + (estimatedInWindow?.lines ?? 0);
    return {
      start: formatLocalIso(new Date(span.from)),
      onTopicLines: Math.max(0, rawRealLines - fixedLinesInWindow),
      deferredLines,
      deferredTestLines: sum(fixedInWindow.map((item) => item.fixedTestLines)) + (estimatedInWindow?.testLines ?? 0),
      deferredTasks: fixedInWindow.length + openInWindow.length,
    };
  });
}
