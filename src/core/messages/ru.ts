import { z } from "zod";
import type { CheckFix, CheckProblem } from "../check/findings";
import type { GraphState } from "../check/graph-health";
import { lineSuffix } from "../check/source-lines";
import { formatDayMonth, formatDecimal } from "../i18n/format";
import { countRu, NBSP, pluralRu } from "../i18n/plural";
import type { CandidateEvidence, CheckMethod, DuplicateMatch } from "../journal/events";
import type { Problem, SchemaIssue } from "../model/problems";
import type { Priority, Resolution, TaskCategory, TaskStatus } from "../model/types";
import type { LockBusy } from "../store/file-lock";
import type { FlowForecast, Signal } from "../stats/types";
import { forecastOutlook, forecastSpan, type SpanUnit } from "./forecast";
import { zodIssueText } from "./zod";

const zodRu = z.locales.ru().localeError;

const CATEGORY_LABELS: Record<TaskCategory, string> = {
  bloaters: "Разбухшее",
  "change-preventers": "Мешает изменениям",
  couplers: "Связанность",
  "data-dealers": "Работа с данными",
  dispensables: "Лишнее",
  "functional-abusers": "Императивность",
  "lexical-abusers": "Именование",
  "oo-abusers": "ООП",
  obfuscators: "Запутанность",
  bug: "Ошибка",
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: "в беклоге",
  "in-progress": "в работе",
  blocked: "заблокирована",
  done: "сделана",
  cancelled: "отменена",
};

const PRIORITY_LABELS: Record<Priority, string> = { low: "низкий", medium: "средний", high: "высокий", critical: "критичный" };

const RESOLUTION_LABELS: Record<Resolution, string> = { fixed: "исправлено", obsolete: "кода нет", duplicate: "дубль", "epic-done": "эпик завершён" };

const EVIDENCE_LABELS: Record<CandidateEvidence | "total", string> = {
  "source-changed": "код изменился",
  "source-missing": "файл пропал",
  duplicate: "дубль",
  "no-source": "нет source",
  total: "Всего",
};

const CHECK_METHOD_LABELS: Record<CheckMethod, string> = { symbol: "по символу", anchor: "по строкам source", file: "по файлу" };

const DUPLICATE_MATCH_LABELS: Record<DuplicateMatch, string> = { source: "по месту в коде", title: "по заголовку", symbol: "по символу" };

const GRAPH_STATE_LABELS: Record<GraphState, string> = { none: "нет", unreadable: "не читается", stale: "устарел", fresh: "свежий" };

export type CountUnit = "task" | "line" | "project" | "day" | "week" | "session";

const COUNT_FORMS: Record<CountUnit, [string, string, string]> = {
  task: ["задача", "задачи", "задач"],
  line: ["строка", "строки", "строк"],
  project: ["проект", "проекта", "проектов"],
  day: ["день", "дня", "дней"],
  week: ["неделя", "недели", "недель"],
  session: ["сессия", "сессии", "сессий"],
};

const SPAN_FORMS: Record<SpanUnit, [string, string, string]> = { week: ["неделю", "недели", "недель"], day: ["день", "дня", "дней"] };

function evidenceLabel(evidence: CandidateEvidence | "total"): string {
  return EVIDENCE_LABELS[evidence];
}

function checkMethodLabel(method: CheckMethod): string {
  return CHECK_METHOD_LABELS[method];
}

function duplicateMatchLabel(match: DuplicateMatch): string {
  return DUPLICATE_MATCH_LABELS[match];
}

function graphStateLabel(state: GraphState): string {
  return GRAPH_STATE_LABELS[state];
}

function count(n: number, unit: CountUnit): string {
  const [one, few, many] = COUNT_FORMS[unit];
  return countRu(n, one, few, many);
}

function span(n: number, unit: SpanUnit): string {
  return countRu(n, ...SPAN_FORMS[unit]);
}

function genitiveDays(days: number): string {
  return `${days} ${pluralRu(days, "дня", "дней", "дней")}`;
}

function days(value: number | null): string {
  if (value === null) return "—";
  if (value < 1) return "меньше дня";
  return `${Math.round(value)}${NBSP}дн.`;
}

function p90(value: number | null): string {
  if (value === null) return "—";
  return value < 1 ? "быстрее суток" : `за ${days(value)}`;
}

function forecast(flow: FlowForecast): string {
  const outlook = forecastOutlook(flow);
  switch (outlook.kind) {
    case "no-open":
      return "Открытых задач нет";
    case "clears":
      return `Долг разберётся примерно за ${outlook.weeks}${NBSP}нед. (к ${formatDayMonth("ru", outlook.until)})`;
    case "not-shrinking":
      return "Долг не уменьшается";
    case "grows":
      return `Долг растёт на ${formatDecimal("ru", outlook.perWeek)}${NBSP}${pluralRu(outlook.perWeek, ...COUNT_FORMS.task)} в неделю`;
  }
}

function forecastTail({ windowDays, closed, created }: FlowForecast): string {
  const { unit, count } = forecastSpan(windowDays);
  return `за ${span(count, unit)}: закрыто ${closed}, создано ${created}`;
}

function signal(s: Signal): string {
  switch (s.kind) {
    case "debt-growing":
      return `Долг растёт ${span(s.params.weeks, "week")} подряд: создано ${s.params.created}, закрыто ${s.params.closed}`;
    case "urgent-stale":
      return `Срочные задачи ждут дольше ${genitiveDays(s.params.days)}: ${s.params.count}`;
    case "stuck":
      return `Застряли в работе: ${s.params.count}, дольше всех ${s.params.id} — ${days(s.params.days)}`;
    case "noisy-check": {
      const { evidence, method, percent, decided, windowDays } = s.params;
      const name = method === null ? `«${evidenceLabel(evidence)}»` : `«${evidenceLabel(evidence)}» ${checkMethodLabel(method)}`;
      return `Проверка ${name} почти всегда ошибается: точность ${percent}% на ${decided} решённых за ${span(windowDays, "day")}`;
    }
    case "low-changed":
      return `Код менялся у ${countRu(s.params.count, "задачи", "задач", "задач")} с низким приоритетом — перепроверьте при случае («почисти беклог»)`;
    case "stale-low":
      return `Задач с низким приоритетом старше ${genitiveDays(s.params.days)}: ${s.params.count} — разберите (backlog prune)`;
  }
}

function schemaIssue(issue: SchemaIssue): string {
  switch (issue.kind) {
    case "bad-id":
      return "некорректный ID";
    case "empty-title":
      return "пустой заголовок";
    case "empty-name":
      return "пустое имя проекта";
    case "bad-prefix":
      return "некорректный префикс";
    case "zod":
      return zodIssueText(zodRu, issue);
  }
}

function problem(p: Problem): string {
  switch (p.code) {
    case "self-block":
      return "задача не может блокировать саму себя";
    case "self-related":
      return "задача не может быть связана сама с собой";
    case "referenced-as-epic":
      return `на задачу ссылаются как на эпик: ${p.children.join(", ")}`;
    case "blocker-cycle":
      return `цикл блокеров: ${p.cycle.join(" → ")}`;
    case "resolution-needs-status":
      return `resolution ${p.resolution} требует статус ${p.status}`;
    case "reason-without-resolution":
      return "reason задаётся только вместе с resolution";
    case "epic-self":
      return "задача не может быть своим эпиком";
    case "epic-missing":
      return `эпик ${p.epic} не найден`;
    case "epic-not-epic":
      return `${p.epic} не является эпиком`;
    case "epic-foreign-project":
      return `эпик ${p.epic} из другого проекта — снимите эпик или выберите эпик этого проекта`;
    case "epic-in-epic":
      return "эпик не может входить в другой эпик";
    case "reference-missing":
      return `${p.id} не найдена`;
    case "no-frontmatter":
      return "файл не начинается с frontmatter (---)";
    case "frontmatter-unclosed":
      return "frontmatter не закрыт строкой ---";
    case "yaml":
      return `ошибка YAML: ${p.detail}`;
    case "schema":
      return p.path === "" ? schemaIssue(p.issue) : `${p.path}: ${schemaIssue(p.issue)}`;
    case "id-mismatch":
      return `id ${p.id} не совпадает с именем файла ${p.file}.md`;
    case "prefix-mismatch":
      return `префикс ${p.file} не совпадает с префиксом проекта ${p.prefix}`;
    case "id-exhausted":
      return `не удалось выделить ID за ${p.attempts} попыток`;
  }
}

function problems(list: readonly Problem[]): string {
  return [...new Set(list.map(problem))].join("; ");
}

function epicDoneReason(ids: readonly string[]): string {
  return `все задачи эпика закрыты: ${ids.join(", ")}`;
}

function checkFix(fix: CheckFix): string {
  switch (fix.kind) {
    case "references-removed":
      return `${fix.taskId}: убраны ссылки на несуществующие задачи: ${fix.ids.join(", ")}`;
    case "epic-closed":
      return `${fix.taskId}: эпик закрыт — ${epicDoneReason(fix.childIds)}`;
    case "epic-reopened":
      return `${fix.taskId}: эпик снова открыт — в нём открытые задачи: ${fix.childIds.join(", ")}`;
    case "source-moved":
      return `${fix.taskId}: source сдвинулся ${lineSuffix(fix.from)} → ${lineSuffix(fix.to)}`;
  }
}

function checkProblem(p: CheckProblem): string {
  switch (p.kind) {
    case "fix-failed":
      return `${p.taskId}: не удалось исправить — ${fixFailureCause(p)}`;
    case "task-invalid":
      return `${p.taskId}: ${problem(p.problem)}`;
    case "file-not-parsed":
      return `Файл ${p.path} не разобран: ${problems(p.problems)}`;
    case "epics-wait-for-files":
      return `Эпики ${p.epicIds.join(", ")} завершены, но не закроются, пока не исправлены неразобранные файлы`;
    case "project-without-repos":
      return `Проект ${p.projectId}: в repos нет путей — код его задач не проверить`;
    case "project-repos-missing":
      return `Проект ${p.projectId}: ни один путь из repos не существует (${p.repos.join(", ")}) — код его задач не проверить`;
    case "project-repo-not-git":
      return `Проект ${p.projectId}: ${p.repo} — не git-репозиторий, коммиты и правки кода его задач не проверяются`;
    case "project-history-unreadable":
      return `Проект ${p.projectId}: не удалось прочитать историю git в ${p.repo} — коммиты и правки кода его задач не проверены`;
    case "prefix-shared":
      return `У проектов ${p.projectIds.join(", ")} один префикс ${p.prefix} — ID их задач пересекаются. Смените prefix в project.md одного из них`;
  }
}

function fixFailureCause(p: Extract<CheckProblem, { kind: "fix-failed" }>): string {
  switch (p.cause) {
    case "invalid":
      return problems(p.problems);
    case "changed-during-check":
      return "файл изменился во время проверки";
    case "gone-during-check":
      return "файл исчез во время проверки";
    case "busy-during-check":
      return "файл занят другим процессом";
  }
}

export const coreRu = {
  hookMark: "Беклог",
  languageName: "Русский",
  problem,
  problems,
  schemaIssue,
  categoryLabel: (category: TaskCategory | undefined): string => (category === undefined ? "не указана" : CATEGORY_LABELS[category]),
  statusLabel: (status: TaskStatus): string => STATUS_LABELS[status],
  priorityLabel: (priority: Priority): string => PRIORITY_LABELS[priority],
  resolutionLabel: (resolution: Resolution): string => RESOLUTION_LABELS[resolution],
  evidenceLabel,
  checkMethodLabel,
  duplicateMatchLabel,
  graphStateLabel,
  count,
  days,
  p90,
  forecast,
  forecastTail,
  signal,
  epicDoneReason,
  fileBusy: ({ path, lock, seconds }: LockBusy): string => `${path} занят другим процессом дольше ${seconds} с (${lock})`,
  checkFix,
  checkProblem,
  runsNotTrimmed: (error: string): string => `Не удалось обрезать журнал запусков: ${error}`,
  journalNotCompacted: (dir: string, error: string): string => `Не удалось уплотнить журнал в ${dir}: ${error}`,
  closedNotSwept: (error: string): string => `Не удалось удалить закрытые задачи: ${error}`,
  serviceLogNotTrimmed: (error: string): string => `Не удалось обрезать лог службы: ${error}`,
  candidatesRecordFailed: (projectId: string, detail: string): string => `Не удалось записать кандидатов в журнал ${projectId}: ${detail}`,
  branchOriginsReadFailed: (projectId: string, detail: string): string => `Не удалось прочитать журнал ${projectId} — задачи из невлитых веток проверяются как обычные: ${detail}`,
};

export type CoreMessages = typeof coreRu;
