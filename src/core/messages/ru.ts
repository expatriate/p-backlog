import { z } from "zod";
import type { CheckFix, CheckProblem } from "../check/findings";
import type { GraphState } from "../check/graph-health";
import { lineSuffix, sourcePath } from "../model/source";
import { formatDayMonth, formatDecimal, formatNumber } from "../i18n/format";
import { countRu, NBSP, pluralRu } from "../i18n/plural";
import type { CandidateEvidence, CheckMethod, DuplicateMatch } from "../journal/events";
import type { Problem, SchemaIssue } from "../model/problems";
import type { Priority, Resolution, TaskCategory, TaskStatus, TaskType } from "../model/types";
import type { CategoryRow, FlowForecast, FoundRow, Signal } from "../stats/types";
import { forecastOutlook, forecastSpan, type SpanUnit } from "./forecast";
import { problemList } from "./problem-list";
import type { CoreMessages, CountUnit } from "./types";
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

const NO_CATEGORY_LABEL = "не указана";

const CATEGORY_ROW_LABELS: Record<CategoryRow["category"], string> = { ...CATEGORY_LABELS, unset: NO_CATEGORY_LABEL, unknown: "неизвестна" };

const FOUND_ROW_LABELS: Record<FoundRow["found"], string> = { review: "на ревью", incidental: "попутно", manual: "вручную", unknown: "неизвестно", unset: "не записано" };

const STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: "в беклоге",
  "in-progress": "в работе",
  blocked: "заблокирована",
  done: "сделана",
  cancelled: "отменена",
};

const TYPE_LABELS: Record<TaskType, string> = { task: "задача", epic: "эпик" };

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

const COUNT_FORMS: Record<CountUnit, [string, string, string]> = {
  task: ["задача", "задачи", "задач"],
  line: ["строка", "строки", "строк"],
  project: ["проект", "проекта", "проектов"],
  day: ["день", "дня", "дней"],
  week: ["неделя", "недели", "недель"],
  session: ["сессия", "сессии", "сессий"],
};

const SPAN_FORMS: Record<SpanUnit, [string, string, string]> = { week: ["неделю", "недели", "недель"], day: ["день", "дня", "дней"] };

const GENITIVE_FORMS: Record<"task" | "day", [string, string, string]> = { task: ["задачи", "задач", "задач"], day: ["дня", "дней", "дней"] };

function count(n: number, unit: CountUnit): string {
  const [one, few, many] = COUNT_FORMS[unit];
  return countRu(n, one, few, many);
}

function span(n: number, unit: SpanUnit): string {
  return countRu(n, ...SPAN_FORMS[unit]);
}

function genitive(n: number, unit: keyof typeof GENITIVE_FORMS): string {
  return countRu(n, ...GENITIVE_FORMS[unit]);
}

function days(value: number | null): string {
  if (value === null) return "—";
  if (value < 1) return "меньше дня";
  return `${formatNumber("ru", Math.round(value))}${NBSP}дн.`;
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
      return `Долг разберётся примерно за ${formatNumber("ru", outlook.weeks)}${NBSP}нед. (к ${formatDayMonth("ru", outlook.until)})`;
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
      return `Срочные задачи ждут дольше ${genitive(s.params.days, "day")}: ${s.params.count}`;
    case "stuck":
      return `Застряли в работе: ${s.params.count}, дольше всех ${s.params.id} — ${days(s.params.days)}`;
    case "noisy-check": {
      const { evidence, method, percent, decided, windowDays } = s.params;
      const name = method === null ? `«${EVIDENCE_LABELS[evidence]}»` : `«${EVIDENCE_LABELS[evidence]}» ${CHECK_METHOD_LABELS[method]}`;
      return `Проверка ${name} почти всегда ошибается: точность ${percent}% на ${decided} решённых за ${span(windowDays, "day")}`;
    }
    case "low-changed":
      return `Код менялся у ${genitive(s.params.count, "task")} с низким приоритетом — перепроверьте при случае («почисти беклог»)`;
    case "stale-low":
      return `Задач с низким приоритетом старше ${genitive(s.params.days, "day")}: ${s.params.count} — разберите (backlog prune)`;
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

const problems = problemList(problem);

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
      return sourcePath(fix.from) === sourcePath(fix.to)
        ? `${fix.taskId}: source сдвинулся ${lineSuffix(fix.from)} → ${lineSuffix(fix.to)}`
        : `${fix.taskId}: файл задачи переименован, source ${fix.from} → ${fix.to}`;
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
    case "project-repo-unsafe":
      return `Проект ${p.projectId}: git не доверяет ${p.repo} (каталог принадлежит другому пользователю) — коммиты и правки кода его задач не проверяются. Исправление: git config --global --add safe.directory "${p.repo}"`;
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

export const coreRu: CoreMessages = {
  hookMark: "Беклог",
  languageName: "Русский",
  problem,
  problems,
  schemaIssue,
  categoryLabel: (category) => (category === undefined ? NO_CATEGORY_LABEL : CATEGORY_LABELS[category]),
  categoryRowLabel: (category) => CATEGORY_ROW_LABELS[category],
  foundRowLabel: (found) => FOUND_ROW_LABELS[found],
  statusLabel: (status) => STATUS_LABELS[status],
  priorityLabel: (priority) => PRIORITY_LABELS[priority],
  typeLabel: (type) => TYPE_LABELS[type],
  resolutionLabel: (resolution) => RESOLUTION_LABELS[resolution],
  evidenceLabel: (evidence) => EVIDENCE_LABELS[evidence],
  checkMethodLabel: (method) => CHECK_METHOD_LABELS[method],
  duplicateMatchLabel: (match) => DUPLICATE_MATCH_LABELS[match],
  graphStateLabel: (state) => GRAPH_STATE_LABELS[state],
  count,
  days,
  p90,
  forecast,
  forecastTail,
  signal,
  epicDoneReason,
  fileBusy: ({ path, lock, seconds }) => `${path} занят другим процессом дольше ${seconds} с (${lock})`,
  checkFix,
  checkProblem,
  runsNotTrimmed: (error) => `Не удалось обрезать журнал запусков: ${error}`,
  journalNotCompacted: (dir, error) => `Не удалось уплотнить журнал в ${dir}: ${error}`,
  closedNotSwept: (error) => `Не удалось удалить закрытые задачи: ${error}`,
  serviceLogNotTrimmed: (error) => `Не удалось обрезать лог службы: ${error}`,
  candidatesRecordFailed: (projectId, detail) => `Не удалось записать кандидатов в журнал ${projectId}: ${detail}`,
  branchOriginsReadFailed: (projectId, detail) => `Не удалось прочитать журнал ${projectId} — задачи из невлитых веток проверяются как обычные: ${detail}`,
  unreadableSkipped: (path, detail) => `Не удалось прочитать ${path}, он пропущен: ${detail}`,
  settingsNotSaved: (path, detail) => `Не удалось сохранить язык в ${path}: ${detail}. Он определяется заново при каждом запуске — разрешите запись в каталог беклога.`,
  settingsFileInvalid: (path) => `${path} не разобран, язык для этого запуска определён автоматически. Файл не изменён — поправьте его вручную.`,
};
