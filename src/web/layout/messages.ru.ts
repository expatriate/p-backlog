import type { GraphState } from "../../core/check/graph-health";
import { NBSP, pluralRu } from "../../core/i18n/plural";

export type HintPart = { code: string } | { text: string };
export type GraphTrouble = Exclude<GraphState, "fresh">;
type GraphNote = { title: string; hint: HintPart[] };

const graphNotesRu: Record<GraphTrouble, GraphNote> = {
  none: { title: "Без графа кода", hint: [{ code: "code-review-graph build" }, { text: " — кандидаты проверки точнее" }] },
  stale: {
    title: "Граф кода устарел",
    hint: [{ code: "code-review-graph watch" }, { text: " или хук " }, { code: "update" }, { text: " — без них проверка не видит символов" }],
  },
  unreadable: { title: "Граф кода не читается", hint: [{ code: "code-review-graph build" }, { text: " заново — база другой версии или от другого пути" }] },
};

export const layoutRu = {
  skipLink: "Перейти к содержимому",
  sidebarNav: "Навигация",
  brand: "беклог",
  sectionsLabel: "Разделы",
  tasksNav: "Задачи",
  statsNav: "Статистика",
  signalsHidden: (n: number): string => `, тревог: ${n}`,
  collapseProjects: "Свернуть список проектов",
  expandProjects: "Развернуть список проектов",
  projects: "Проекты",
  taskWord: (n: number): string => pluralRu(n, "задача", "задачи", "задач"),
  checkedSuffix: `${NBSP}— с${NBSP}галочкой`,
  languageSwitchLabel: "Язык интерфейса",
  languageSwitchFailed: "Не удалось изменить язык",
  graphNotes: graphNotesRu,
  checkboxLabel: (name: string): string => `Учитывать проект ${name} в области «Проекты»`,
  setActiveFailed: (active: boolean): string => `Не удалось ${active ? "учесть" : "исключить"} проект`,
  deleteButtonLabel: (name: string): string => `Удалить проект ${name}`,
  deleteButtonTitle: "Удалить проект",
  deleteFailed: "Не удалось удалить проект",
  deleteDialogTitle: (name: string): string => `Удалить проект «${name}»?`,
  deleteDialogDescriptionUnknown: "Каталог проекта удалится со всеми задачами, отменить нельзя.",
  deleteDialogDescription: (taskCount: number): string => `Задач: ${taskCount}. Каталог проекта удалится вместе с ними, отменить нельзя.`,
  confirmWordLabel: (id: string): string => `Введите id проекта: ${id}`,
  confirmLabel: "Удалить",
};

export type LayoutMessages = typeof layoutRu;
