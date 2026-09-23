export const uiRu = {
  cancel: "Отмена",
  close: "Закрыть",
  progress: "Прогресс",
  retry: "Повторить",
  retrying: "Повторяем…",
  deletionDelayed: "удаление задержано",
  deletionDelayedTitle: (dayMonth: string): string =>
    `должна была удалиться ${dayMonth}; проход удаления держит задачу, пока её эпик не закрыт или беклог не исправлен`,
  deletesToday: "удалится сегодня",
  deletesInDays: (days: number): string => `удалится через ${days} дн.`,
  deletesOn: (dayMonth: string): string => `удалится ${dayMonth}`,
};

export type UiMessages = typeof uiRu;
