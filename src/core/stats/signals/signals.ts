import { STALE_URGENT_DAYS } from "../breakdowns";
import { inWorkTasks } from "../flow/current";
import { EVIDENCE_LABELS, formatDays, pluralCount } from "../format";
import { qualityReport } from "../quality/quality-report";
import { statsReport } from "../report";
import { statsScope, type StatsInput } from "../scope";
import type { AccuracyRow, Signal, StatsReport } from "../types";

const GROWTH_WEEKS = 3;
const STUCK_IN_PROGRESS_DAYS = 7;
const STUCK_BLOCKED_DAYS = 14;
const NOISY_MIN_DECIDED = 10;
const NOISY_MAX_PERCENT = 20;

export function statsSignals(input: StatsInput): Signal[] {
  const overview = statsReport(input);
  return [...debtGrowing(overview), ...urgentStale(overview), ...stuck(input), ...noisyChecks(qualityReport(input).accuracy)];
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

function stuck(input: StatsInput): Signal[] {
  const scope = statsScope(input);
  const tasks = scope.tasks.filter((task) => task.type === "task");
  const stuckTasks = inWorkTasks(tasks, scope.histories, input.now).filter(
    (item) => item.days > (item.status === "blocked" ? STUCK_BLOCKED_DAYS : STUCK_IN_PROGRESS_DAYS),
  );
  const longest = stuckTasks[0];
  if (longest === undefined) return [];
  return [{ kind: "stuck", text: `Застряли в работе: ${stuckTasks.length}, дольше всех ${longest.id} — ${formatDays(longest.days)}` }];
}

function noisyChecks(accuracy: readonly AccuracyRow[]): Signal[] {
  return accuracy.flatMap((row) => {
    const decided = row.closed + row.verified;
    if (row.evidence === "total" || decided < NOISY_MIN_DECIDED || row.precision === null) return [];
    const shownPercent = Math.round(row.precision * 100);
    if (shownPercent >= NOISY_MAX_PERCENT) return [];
    return [{ kind: "noisy-check", text: `Проверка «${EVIDENCE_LABELS[row.evidence]}» почти всегда ошибается: точность ${shownPercent}% на ${decided} решённых` }];
  });
}
