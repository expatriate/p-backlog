import { STALE_LOW_DAYS, staleLowTasks } from "../../model/query";
import { STALE_URGENT_DAYS } from "../breakdowns";
import { DAY_MS } from "../../model/lifecycle";
import { inWorkTasks } from "../flow/current";
import { EVIDENCE_LABELS, formatDays, pluralCount } from "../format";
import { accuracy } from "../quality/accuracy";
import { statsReport } from "../report";
import { reportBase, type ReportBase, type StatsInput } from "../scope";
import type { AccuracyRow, Signal, StatsReport } from "../types";

const GROWTH_WEEKS = 3;
const STUCK_IN_PROGRESS_DAYS = 7;
const STUCK_BLOCKED_DAYS = 14;
const NOISY_MIN_DECIDED = 10;
const NOISY_MAX_PERCENT = 20;
const NOISY_WINDOW_DAYS = 14;

export function statsSignals(input: StatsInput, base: ReportBase = reportBase(input)): Signal[] {
  const overview = statsReport(input, base);
  return [...debtGrowing(overview), ...urgentStale(overview), ...stuck(base, input.now), ...noisyChecks(base, input.now), ...staleLow(base, input.now)];
}

function debtGrowing({ weeks }: StatsReport): Signal[] {
  const recent = weeks.slice(-GROWTH_WEEKS);
  if (recent.length < GROWTH_WEEKS || !recent.every((week) => week.created > week.closed)) return [];
  const created = recent.reduce((sum, week) => sum + week.created, 0);
  const closed = recent.reduce((sum, week) => sum + week.closed, 0);
  return [{ kind: "debt-growing", text: `Долг растёт третью неделю подряд: за ${pluralCount(GROWTH_WEEKS, "неделю", "недели", "недель")} создано ${created}, закрыто ${closed}` }];
}

function urgentStale({ age }: StatsReport): Signal[] {
  return age.urgentStale === 0 ? [] : [{ kind: "urgent-stale", text: `Срочные задачи ждут дольше ${STALE_URGENT_DAYS} дней: ${age.urgentStale}` }];
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
  return stale.length === 0 ? [] : [{ kind: "stale-low", text: `Задач с низким приоритетом старше ${STALE_LOW_DAYS} дней: ${stale.length} — разберите (backlog prune)` }];
}

function noisyChecks({ histories }: ReportBase, now: Date): Signal[] {
  const recent = accuracy(histories, now.getTime() - NOISY_WINDOW_DAYS * DAY_MS, now.getTime());
  return recent.flatMap((row) => {
    const decided = row.closed + row.verified;
    if (!measuredByClosing(row.evidence) || decided < NOISY_MIN_DECIDED || row.precision === null) return [];
    const shownPercent = Math.round(row.precision * 100);
    if (shownPercent >= NOISY_MAX_PERCENT) return [];
    return [
      {
        kind: "noisy-check",
        text: `Проверка «${EVIDENCE_LABELS[row.evidence]}» почти всегда ошибается: точность ${shownPercent}% на ${decided} решённых за ${pluralCount(NOISY_WINDOW_DAYS, "день", "дня", "дней")}`,
      },
    ];
  });
}

function measuredByClosing(evidence: AccuracyRow["evidence"]): boolean {
  return evidence !== "total" && evidence !== "no-source";
}
