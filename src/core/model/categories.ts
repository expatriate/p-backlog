import type { TaskCategory } from "./types";

export const CATEGORY_LABELS: Record<TaskCategory, string> = {
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

export const NO_CATEGORY_LABEL = "не указана";

export function categoryLabel(category: TaskCategory | undefined): string {
  return category === undefined ? NO_CATEGORY_LABEL : CATEGORY_LABELS[category];
}
