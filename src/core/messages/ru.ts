import { z } from "zod";
import type { GraphState } from "../check/graph-health";
import { formatDayMonth } from "../i18n/format";
import { countRu, pluralRu } from "../i18n/plural";
import type { CandidateEvidence, CheckMethod, DuplicateMatch } from "../journal/events";
import type { Problem, SchemaIssue } from "../model/problems";
import type { Priority, Resolution, TaskCategory, TaskStatus } from "../model/types";
import { formatDays, formatDecimal, NBSP, roundToTenth } from "../stats/format";
import type { FlowForecast, Signal } from "../stats/types";
import type { CountUnit } from "./index";
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

const COUNT_FORMS: Record<CountUnit, [string, string, string]> = {
  task: ["задача", "задачи", "задач"],
  line: ["строка", "строки", "строк"],
  project: ["проект", "проекта", "проектов"],
  day: ["день", "дня", "дней"],
  week: ["неделя", "недели", "недель"],
  session: ["сессия", "сессии", "сессий"],
};

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

function genitiveDays(days: number): string {
  return `${days} ${pluralRu(days, "дня", "дней", "дней")}`;
}

function forecast({ open, weeklyNet, weeks, until }: FlowForecast): string {
  if (open === 0) return "Открытых задач нет";
  if (weeks !== null && until !== null) return `Долг разберётся примерно за ${weeks}${NBSP}нед. (к ${formatDayMonth("ru", new Date(until))})`;
  if (weeklyNet === 0) return "Долг не уменьшается";
  const growth = roundToTenth(-weeklyNet);
  return `Долг растёт на ${formatDecimal(growth)}${NBSP}${pluralRu(growth, "задача", "задачи", "задач")} в неделю`;
}

function forecastTail({ windowWeeks, closed, created }: FlowForecast): string {
  return `за ${countRu(windowWeeks, "неделю", "недели", "недель")}: закрыто ${closed}, создано ${created}`;
}

function signal(s: Signal): string {
  switch (s.kind) {
    case "debt-growing":
      return `Долг растёт ${countRu(s.params.weeks, "неделю", "недели", "недель")} подряд: создано ${s.params.created}, закрыто ${s.params.closed}`;
    case "urgent-stale":
      return `Срочные задачи ждут дольше ${genitiveDays(s.params.days)}: ${s.params.count}`;
    case "stuck":
      return `Застряли в работе: ${s.params.count}, дольше всех ${s.params.id} — ${formatDays(s.params.days)}`;
    case "noisy-check": {
      const { evidence, method, percent, decided, windowDays } = s.params;
      const name = method === null ? `«${evidenceLabel(evidence)}»` : `«${evidenceLabel(evidence)}» ${checkMethodLabel(method)}`;
      return `Проверка ${name} почти всегда ошибается: точность ${percent}% на ${decided} решённых за ${countRu(windowDays, "день", "дня", "дней")}`;
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

export const coreRu = {
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
  forecast,
  forecastTail,
  signal,
  fastModelSuffix: " (быстрый режим)",
  epicDoneReason: (ids: readonly string[]): string => `все задачи эпика закрыты: ${ids.join(", ")}`,
  fileBusy: (path: string, lock: string, seconds: number): string => `${path} занят другим процессом дольше ${seconds} с (${lock})`,
  referencesRemoved: (ids: readonly string[]): string => `убраны ссылки на несуществующие задачи: ${ids.join(", ")}`,
  epicClosed: (reason: string): string => `эпик закрыт — ${reason}`,
  fixFailed: (id: string, detail: string): string => `${id}: не удалось исправить — ${detail}`,
  changedDuringCheck: "файл изменился во время проверки",
  goneDuringCheck: "файл исчез во время проверки",
  fileNotParsed: (path: string, list: readonly Problem[]): string => `Файл ${path} не разобран: ${problems(list)}`,
  epicsWaitForFiles: (ids: readonly string[]): string => `Эпики ${ids.join(", ")} завершены, но не закроются, пока не исправлены неразобранные файлы`,
  projectWithoutRepos: (projectId: string): string => `Проект ${projectId}: в repos нет путей — код его задач не проверить`,
  projectReposMissing: (projectId: string, repos: readonly string[]): string =>
    `Проект ${projectId}: ни один путь из repos не существует (${repos.join(", ")}) — код его задач не проверить`,
  sourceMoved: (id: string, from: string, to: string): string => `${id}: source сдвинулся ${from} → ${to}`,
  moreDiffLines: (count: number): string => `… ещё ${count} строк`,
};

