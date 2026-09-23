import { STALE_LOW_DAYS, staleLowTasks } from "../../model/query";
import { STALE_URGENT_DAYS, urgentStaleCount } from "../breakdowns";
import { DAY_MS } from "../../model/lifecycle";
import { inWorkTasks } from "../flow/current";
import { CHECK_METHOD_LABELS, EVIDENCE_LABELS, formatDays, plural, pluralCount } from "../format";
import { sum } from "../numbers";
import { period, type Period } from "../period";
import { accuracy, methodAccuracy } from "../quality/accuracy";
import { reportBase, type ReportBase, type StatsInput } from "../scope";
import type { AccuracyRow, Signal, WeekFlow } from "../types";

type CheckGauge = { name: string; closed: number; verified: number; precision: number | null };
import { weeklyFlow } from "../weeks";

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
  return [{ kind: "debt-growing", text: `Долг растёт ${pluralCount(GROWTH_WEEKS, "неделю", "недели", "недель")} подряд: создано ${created}, закрыто ${closed}` }];
}

function urgentStale(count: number): Signal[] {
  return count === 0 ? [] : [{ kind: "urgent-stale", text: `Срочные задачи ждут дольше ${genitiveDays(STALE_URGENT_DAYS)}: ${count}` }];
}

function stuck({ scope, tasks }: ReportBase, now: Date): Signal[] {
  const stuckTasks = inWorkTasks(tasks, scope.histories, now).filter(
    (item) => item.days > (item.status === "blocked" ? STUCK_BLOCKED_DAYS : STUCK_IN_PROGRESS_DAYS),
  );
  const longest = stuckTasks[0];
  if (longest === undefined) return [];
  return [{ kind: "stuck", text: `Застряли в работе: ${stuckTasks.length}, дольше всех ${longest.id} — ${formatDays(longest.days)}` }];
}

function staleLow({ scope }: ReportBase, now: Date): Signal[] {
  const stale = staleLowTasks(scope.tasks, now);
  return stale.length === 0 ? [] : [{ kind: "stale-low", text: `Задач с низким приоритетом старше ${genitiveDays(STALE_LOW_DAYS)}: ${stale.length} — разберите (backlog prune)` }];
}

function noisyChecks({ histories }: ReportBase, now: Date): Signal[] {
  return checkGauges(histories, period(now.getTime() - NOISY_WINDOW_DAYS * DAY_MS, now.getTime())).flatMap((gauge) => {
    const decided = gauge.closed + gauge.verified;
    if (decided < NOISY_MIN_DECIDED || gauge.precision === null) return [];
    const shownPercent = Math.round(gauge.precision * 100);
    if (shownPercent >= NOISY_MAX_PERCENT) return [];
    return [
      {
        kind: "noisy-check",
        text: `Проверка ${gauge.name} почти всегда ошибается: точность ${shownPercent}% на ${decided} решённых за ${pluralCount(NOISY_WINDOW_DAYS, "день", "дня", "дней")}`,
      },
    ];
  });
}

function checkGauges(histories: ReportBase["histories"], window: Period): CheckGauge[] {
  const byEvidence = accuracy(histories, window)
    .filter((row) => measuredByClosing(row.evidence) && row.evidence !== "source-changed")
    .map((row) => ({ ...row, name: `«${EVIDENCE_LABELS[row.evidence]}»` }));
  const byFile = methodAccuracy(histories, window).flatMap((row) => (row.by === "file" ? [{ ...row, name: `«${EVIDENCE_LABELS["source-changed"]}» ${CHECK_METHOD_LABELS.file}` }] : []));
  return [...byFile, ...byEvidence];
}

function measuredByClosing(evidence: AccuracyRow["evidence"]): boolean {
  return evidence !== "total" && evidence !== "no-source";
}

function genitiveDays(days: number): string {
  return `${days} ${plural(days, "дня", "дней", "дней")}`;
}
