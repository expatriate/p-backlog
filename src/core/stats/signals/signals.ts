import { STALE_LOW_DAYS, staleLowTasks } from "../../model/query";
import { STALE_URGENT_DAYS, urgentStaleCount } from "../breakdowns";
import { DAY_MS } from "../../model/lifecycle";
import { inWorkTasks } from "../flow/current";
import { sum } from "../numbers";
import { period, type Period } from "../period";
import type { CandidateEvidence, CheckMethod } from "../../journal/events";
import { accuracy, methodAccuracy } from "../quality/accuracy";
import { reportBase, type ReportBase, type StatsInput } from "../scope";
import type { AccuracyRow, Signal, WeekFlow } from "../types";
import { weeklyFlow } from "../weeks";

type CheckGauge = { evidence: CandidateEvidence; method: CheckMethod | null; closed: number; verified: number; precision: number | null };

const GROWTH_WEEKS = 3;
const STUCK_IN_PROGRESS_DAYS = 7;
const STUCK_BLOCKED_DAYS = 14;
const NOISY_MIN_DECIDED = 10;
const NOISY_MAX_PERCENT = 20;
const NOISY_WINDOW_DAYS = 14;

export function statsSignals(input: StatsInput, base: ReportBase = reportBase(input)): Signal[] {
  const { now } = input;
  return [
    ...debtGrowing(weeklyFlow(base.histories, now)),
    ...urgentStale(urgentStaleCount(base.openTasks, now)),
    ...stuck(base, now),
    ...noisyChecks(base, now),
    ...staleLow(base, now),
  ];
}

function debtGrowing(weeks: readonly WeekFlow[]): Signal[] {
  const recent = weeks.slice(-GROWTH_WEEKS);
  if (recent.length < GROWTH_WEEKS || !recent.every((week) => week.created > week.closed)) return [];
  const created = sum(recent.map((week) => week.created));
  const closed = sum(recent.map((week) => week.closed));
  return [{ kind: "debt-growing", params: { weeks: GROWTH_WEEKS, created, closed } }];
}

function urgentStale(count: number): Signal[] {
  return count === 0 ? [] : [{ kind: "urgent-stale", params: { days: STALE_URGENT_DAYS, count } }];
}

function stuck({ scope, tasks }: ReportBase, now: Date): Signal[] {
  const stuckTasks = inWorkTasks(tasks, scope.histories, now).filter(
    (item) => item.days > (item.status === "blocked" ? STUCK_BLOCKED_DAYS : STUCK_IN_PROGRESS_DAYS),
  );
  const longest = stuckTasks[0];
  if (longest === undefined) return [];
  return [{ kind: "stuck", params: { count: stuckTasks.length, id: longest.id, days: longest.days } }];
}

function staleLow({ scope }: ReportBase, now: Date): Signal[] {
  const stale = staleLowTasks(scope.tasks, now);
  return stale.length === 0 ? [] : [{ kind: "stale-low", params: { days: STALE_LOW_DAYS, count: stale.length } }];
}

function noisyChecks({ histories }: ReportBase, now: Date): Signal[] {
  return checkGauges(histories, period(now.getTime() - NOISY_WINDOW_DAYS * DAY_MS, now.getTime())).flatMap((gauge) => {
    const decided = gauge.closed + gauge.verified;
    if (decided < NOISY_MIN_DECIDED || gauge.precision === null) return [];
    const percent = Math.round(gauge.precision * 100);
    if (percent >= NOISY_MAX_PERCENT) return [];
    return [{ kind: "noisy-check", params: { evidence: gauge.evidence, method: gauge.method, percent, decided, windowDays: NOISY_WINDOW_DAYS } }];
  });
}

function checkGauges(histories: ReportBase["histories"], window: Period): CheckGauge[] {
  const byEvidence = accuracy(histories, window)
    .filter((row): row is AccuracyRow & { evidence: CandidateEvidence } => measuredByClosing(row.evidence) && row.evidence !== "source-changed")
    .map((row) => ({ ...row, method: null }));
  const byFile = methodAccuracy(histories, window).flatMap((row) =>
    row.by === "file" ? [{ ...row, evidence: "source-changed" as const, method: "file" as const }] : [],
  );
  return [...byFile, ...byEvidence];
}

function measuredByClosing(evidence: AccuracyRow["evidence"]): boolean {
  return evidence !== "total" && evidence !== "no-source";
}
