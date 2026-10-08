import { STALE_LOW_DAYS, staleLowTasks } from "../../model/query";
import { STALE_URGENT_DAYS, urgentStaleCount } from "../breakdowns";
import { inWorkTasks, type WorkStatus } from "../flow/current";
import { sum, toPercent } from "../../numbers";
import { trailingSpan, type Span } from "../period";
import type { CandidateEvidence, CheckMethod } from "../../journal/events";
import { accuracy, decidedOf, isMeasuredEvidence, METHOD_EVIDENCE, methodAccuracy } from "../quality/accuracy";
import type { ReportContext } from "../scope";
import type { AccuracyRow, FlowPeriod, Signal } from "../types";
import { weeklyFlow } from "../weeks";
import { DAY_MS } from "../../model/dates";

type CheckGauge = { evidence: CandidateEvidence; method: CheckMethod | null; closed: number; verified: number; precision: number | null };

const GROWTH_WEEKS = 3;
const STUCK_AFTER_DAYS: Record<WorkStatus, number> = { "in-progress": 7, blocked: 14 };
const NOISY_MIN_DECIDED = 10;
const NOISY_MAX_PERCENT = 20;
const NOISY_WINDOW_DAYS = 14;

export function statsSignals(context: ReportContext): Signal[] {
  const { now } = context.input;
  return [...debtGrowing(weeklyFlow(context.histories, now)), ...urgentStale(urgentStaleCount(context.openTasks, now)), ...stuck(context), ...noisyChecks(context), ...staleLow(context)];
}

function debtGrowing(weeks: readonly FlowPeriod[]): Signal[] {
  const recent = weeks.slice(0, -1).slice(-GROWTH_WEEKS);
  if (recent.length < GROWTH_WEEKS || !recent.every((week) => week.created > week.closed)) return [];
  const created = sum(recent.map((week) => week.created));
  const closed = sum(recent.map((week) => week.closed));
  return [{ kind: "debt-growing", params: { weeks: GROWTH_WEEKS, created, closed } }];
}

function urgentStale(count: number): Signal[] {
  return count === 0 ? [] : [{ kind: "urgent-stale", params: { days: STALE_URGENT_DAYS, count } }];
}

function stuck({ scope, tasks, input: { now } }: ReportContext): Signal[] {
  const stuckTasks = inWorkTasks(tasks, scope.historiesWithEpics, now).filter((item) => item.days > STUCK_AFTER_DAYS[item.status]);
  const longest = stuckTasks[0];
  if (longest === undefined) return [];
  return [{ kind: "stuck", params: { count: stuckTasks.length, id: longest.id, days: longest.days } }];
}

function staleLow({ scope, input: { now } }: ReportContext): Signal[] {
  const stale = staleLowTasks(scope.tasksWithEpics, now);
  return stale.length === 0 ? [] : [{ kind: "stale-low", params: { days: STALE_LOW_DAYS, count: stale.length } }];
}

function noisyChecks({ histories, input: { now } }: ReportContext): Signal[] {
  return checkGauges(histories, trailingSpan(now.getTime(), NOISY_WINDOW_DAYS * DAY_MS)).flatMap((gauge) => {
    const decided = decidedOf(gauge);
    if (decided < NOISY_MIN_DECIDED || gauge.precision === null) return [];
    const percent = toPercent(gauge.precision);
    if (percent >= NOISY_MAX_PERCENT) return [];
    return [{ kind: "noisy-check", params: { evidence: gauge.evidence, method: gauge.method, percent, decided, windowDays: NOISY_WINDOW_DAYS } }];
  });
}

function checkGauges(histories: ReportContext["histories"], window: Span): CheckGauge[] {
  const byEvidence = accuracy(histories, window)
    .filter((row): row is AccuracyRow & { evidence: CandidateEvidence } => measuredByClosing(row.evidence) && row.evidence !== METHOD_EVIDENCE)
    .map((row) => ({ ...row, method: null }));
  const byFile = methodAccuracy(histories, window).flatMap((row) => (row.by === "file" ? [{ ...row, method: row.by }] : []));
  return [...byFile, ...byEvidence];
}

function measuredByClosing(evidence: AccuracyRow["evidence"]): boolean {
  return evidence !== "total" && isMeasuredEvidence(evidence);
}
