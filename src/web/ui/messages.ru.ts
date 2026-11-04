export const uiRu = {
  cancel: "Отмена",
  close: "Закрыть",
  progress: "Прогресс",
  retry: "Повторить",
  retrying: "Повторяем…",
  deletionDelayed: "удаление задержано",
  deletionDelayedTitle: (dayMonth: string): string => `должна была удалиться ${dayMonth}; удалится при следующей уборке`,
  deletesAfterEpic: (epic: string): string => `удалится после эпика ${epic}`,
  deletesAfterEpicTitle: (days: number): string => `задачи открытого эпика хранятся, пока эпик не закроется, затем ещё ${days} дн.`,
  deletesToday: "удалится сегодня",
  deletesInDays: (days: number): string => `удалится через ${days} дн.`,
  deletesOn: (dayMonth: string): string => `удалится ${dayMonth}`,
};

export type UiMessages = typeof uiRu;
