import type { TaskType } from "../../core/model/types";

export const taskRu = {
  cardLabel: (id: string): string => `Задача ${id}`,
  title: "Название задачи",
  description: "Описание задачи",
  leaveWithDraft: "Уйти без сохранения описания?",
  createdLabel: "создана",
  closedLabel: "Закрыта",
  restoreToBacklog: "Вернуть в беклог",
  saving: "Сохраняем…",
  saved: "Сохранено",
  draftConflict: "Описание изменилось на диске, пока вы его правили. «Сохранить» перезапишет его вашим текстом, «Отмена» покажет актуальное.",
  taskConflict: "Задача изменилась на диске, показана актуальная версия. Повторите правку.",
  taskGone: (id: string): string => `Задачи ${id} больше нет в беклоге: её удалили или перенесли.`,
  fieldConflict: (field: string): string =>
    `Поле «${field}» изменилось на диске, пока вы его правили. В поле остался ваш вариант: выйдите из поля ещё раз, чтобы записать его поверх.`,

  statusField: "Статус",
  priorityField: "Приоритет",
  categoryField: "Категория",
  typeField: "Тип",
  epicField: "Эпик",
  epicPlaceholder: "ID эпика",
  tagsField: "Теги через запятую",
  typeLabels: { task: "задача", epic: "эпик" } as Record<TaskType, string>,

  save: "Сохранить",
  editDescription: "Редактировать описание",

  blockedByLabel: "Блокируется",
  relatedLabel: "Связанные",
  dependentsLabel: "Блокирует",
  referrersLabel: "Ссылаются как на связанную",
  epicChildrenLabel: "Задачи эпика",

  refNotFound: "не найдена",
  removeRef: (id: string): string => `Убрать ${id}`,
  addRefPlaceholder: "ID задачи",
  addRefLabel: (label: string): string => `Добавить в «${label}»`,
  addRef: "Добавить",
  invalidRefId: (example: string): string => `Введите ID задачи, например ${example}`,
  duplicateRef: (id: string): string => `${id} уже в списке`,
};

export type TaskMessages = typeof taskRu;
