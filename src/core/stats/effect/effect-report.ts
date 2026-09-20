import { formatLocalIso } from "../../model/dates";
import { isClosed } from "../../model/graph";
import type { TaskCategory } from "../../model/types";
import { fixKey, reasonHashes } from "../code/fixes";
import { isFixedNow, type TaskHistory } from "../history";
import { median } from "../numbers";
import { statsScope, type StatsInput } from "../scope";
import type { CollectedCode, CommitUnit, EffectProject, EffectReport, EffectTotals, EffectWeek, FixCommit } from "../types";
import { periodStart, STATS_WEEKS, weekStarts } from "../weeks";

export const MIN_FIXES_FOR_ESTIMATE = 5;

export type EffectInput = StatsInput & { code: CollectedCode };

type Deferred = { history: TaskHistory; fixedLines: number | null; fixedTestLines: number; fixedAt: number | null };
type FixSize = { lines: number; testLines: number };
type FixSample = FixSize & { category: TaskCategory | undefined };
type Estimate = (category: TaskCategory | undefined) => FixSize | null;

export function effectReport({ code, ...input }: EffectInput): EffectReport {
  const { now, projectId } = input;
  const scope = statsScope(input);
  const histories = scope.histories.filter((history) => history.type === "task");
  const from = periodStart(now);
  const to = now.getTime();
  const inPeriod = (moment: number) => moment >= from && moment <= to;
  const projects = code.projects.filter((project) => project.repos.length > 0 && (projectId === undefined || project.projectId === projectId));
  const deferred = buildDeferred(histories.filter((history) => inPeriod(history.createdAt)), code);
  const allHistories = statsScope({ ...input, projectId: undefined }).histories.filter((history) => history.type === "task");
  const estimate = estimator(estimateSamples(allHistories, code));
  const adoptionStart = (id: string) => {
    const created = histories.filter((history) => history.projectId === id).map((history) => history.createdAt);
    return created.length === 0 ? from : Math.max(from, Math.min(...created));
  };
  const unitsSince = (id: string, since: number) =>
    projects
      .filter((project) => project.projectId === id)
      .flatMap((project) => project.repos.flatMap((repo) => repo.units))
      .filter((unit) => {
        const moment = Date.parse(unit.date);
        return moment >= since && moment <= to;
      });
  const unitsForTotals = (id?: string) => {
    const ids = id === undefined ? projects.map((project) => project.projectId) : [id];
    return ids.flatMap((projectIdOf) => unitsSince(projectIdOf, adoptionStart(projectIdOf)));
  };
  const periodUnits = projects.flatMap((project) => project.repos.flatMap((repo) => repo.units)).filter((unit) => inPeriod(Date.parse(unit.date)));
  const totals = totalsOf(deferred, unitsForTotals(), estimate);
  return {
    taskCount: histories.length,
    journalSince: scope.journalSince,
    invalidJournalLines: scope.invalidJournalLines,
    unavailableRepos: code.unavailableRepos,
    totals,
    weeks: weeksOf(deferred, periodUnits, estimate, now),
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

function fixCommitEntry(history: TaskHistory, code: CollectedCode): { key: string; commit: FixCommit } | undefined {
  const hash = reasonHashes(history.reason).find((candidate) => code.fixCommits.has(fixKey(history.projectId, candidate)));
  if (hash === undefined) return undefined;
  const key = fixKey(history.projectId, hash);
  const commit = code.fixCommits.get(key);
  return commit === undefined ? undefined : { key, commit };
}

function buildDeferred(candidates: readonly TaskHistory[], code: CollectedCode): Deferred[] {
  const groups = new Map<string, { commit: FixCommit; histories: TaskHistory[] }>();
  const open: TaskHistory[] = [];
  for (const history of candidates) {
    if (!isClosed(history.finalStatus)) {
      open.push(history);
      continue;
    }
    if (!isFixedNow(history)) continue;
    const entry = fixCommitEntry(history, code);
    if (entry === undefined) continue;
    const group = groups.get(entry.key) ?? { commit: entry.commit, histories: [] };
    group.histories.push(history);
    groups.set(entry.key, group);
  }
  const fixed = [...groups.values()].flatMap(({ commit, histories }) =>
    histories.map((history): Deferred => ({ history, fixedLines: commit.lines / histories.length, fixedTestLines: commit.testLines / histories.length, fixedAt: Date.parse(commit.date) })),
  );
  return [...fixed, ...open.map((history): Deferred => ({ history, fixedLines: null, fixedTestLines: 0, fixedAt: null }))];
}

function estimateSamples(histories: readonly TaskHistory[], code: CollectedCode): FixSample[] {
  const seen = new Map<string, FixSample>();
  for (const history of histories) {
    if (!isFixedNow(history)) continue;
    const entry = fixCommitEntry(history, code);
    if (entry === undefined || seen.has(entry.key)) continue;
    seen.set(entry.key, { category: history.category, lines: entry.commit.lines, testLines: entry.commit.testLines });
  }
  return [...seen.values()];
}

function estimator(samples: readonly FixSample[]): Estimate {
  const overall = sizeOf(samples);
  return (category) => {
    if (category === undefined) return overall;
    return sizeOf(samples.filter((sample) => sample.category === category)) ?? overall;
  };
}

function sizeOf(samples: readonly FixSample[]): FixSize | null {
  const lines = samples.length < MIN_FIXES_FOR_ESTIMATE ? null : median(samples.map((sample) => sample.lines));
  if (lines === null) return null;
  const totalLines = samples.reduce((sum, sample) => sum + sample.lines, 0);
  const testShare = totalLines === 0 ? 0 : samples.reduce((sum, sample) => sum + sample.testLines, 0) / totalLines;
  return { lines, testLines: lines * testShare };
}

function totalsOf(deferred: readonly Deferred[], units: readonly CommitUnit[], estimate: Estimate): EffectTotals {
  const fixed = deferred.flatMap((item) => (item.fixedLines === null ? [] : [item.fixedLines]));
  const open = deferred.filter((item) => item.fixedLines === null);
  const estimated = estimatedSizeOf(open, estimate);
  const estimatedLines = estimated?.lines ?? null;
  const realLines = units.reduce((sum, unit) => sum + unit.lines, 0);
  const fixedLines = fixed.reduce((sum, lines) => sum + lines, 0);
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

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function weeksOf(deferred: readonly Deferred[], periodUnits: readonly CommitUnit[], estimate: Estimate, now: Date): EffectWeek[] {
  const starts = weekStarts(now, STATS_WEEKS);
  return starts.map((start, index) => {
    const end = starts[index + 1]?.getTime() ?? now.getTime() + 1;
    const inWeek = (moment: number) => moment >= start.getTime() && moment < end;
    const rawRealLines = periodUnits.filter((unit) => inWeek(Date.parse(unit.date))).reduce((sum, unit) => sum + unit.lines, 0);
    const fixedInWeek = deferred.filter((item) => item.fixedAt !== null && inWeek(item.fixedAt));
    const openInWeek = deferred.filter((item) => item.fixedLines === null && inWeek(item.history.createdAt));
    const fixedLinesInWeek = fixedInWeek.reduce((sum, item) => sum + (item.fixedLines ?? 0), 0);
    const estimatedInWeek = estimatedSizeOf(openInWeek, estimate);
    const deferredLines = fixedLinesInWeek + (estimatedInWeek?.lines ?? 0);
    return {
      start: formatLocalIso(start),
      onTopicLines: Math.max(0, rawRealLines - fixedLinesInWeek),
      deferredLines,
      deferredTestLines: sum(fixedInWeek.map((item) => item.fixedTestLines)) + (estimatedInWeek?.testLines ?? 0),
      deferredTasks: fixedInWeek.length + openInWeek.length,
    };
  });
}
