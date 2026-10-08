export const serverRu = {
  taskNotFound: (id: string): string => `Задача ${id} не найдена`,
  taskChangedOnDisk: "Задача изменилась на диске",
  projectNotFound: (id: string): string => `Проект ${id} не найден`,
  confirmMismatch: "Подтверждение не совпадает с id проекта",
  bodyNotParsed: "Тело запроса не разобрано: ожидается JSON",
  batchSkipped: {
    changed: (id: string): string => `${id} изменилась на диске`,
    "not-found": (id: string): string => `${id} не найдена`,
    "already-closed": (id: string): string => `${id} уже закрыта`,
    invalid: (id: string): string => `${id}: действие к ней не подходит`,
    busy: (id: string): string => `${id} занята другим процессом`,
  },
  batchFailed: (id: string, detail: string): string => `${id} не записана: ${detail}`,
  unknownRoute: (path: string): string => `Неизвестный адрес API: ${path}`,
  hostRejected: (host: string): string => `Запросы с хоста ${host} не принимаются`,
  jsonContentTypeExpected: "Ожидается Content-Type: application/json",

  serverStarted: (origin: string, root: string): string => `p-backlog: ${origin}\nКаталог беклога: ${root}`,
  settingsFileInvalid: (path: string): string => `${path} не разобран, язык для этого запуска определён автоматически. Файл не изменён — поправьте его вручную.`,

  closedEpics: (ids: string): string => `Закрыты завершённые эпики: ${ids}`,
  reopenedEpics: (ids: string): string => `Снова открыты эпики, в которых открыли задачу: ${ids}`,
  epicsBlockedByFiles: (paths: string): string => `Эпики не закрываются, пока не разобраны файлы: ${paths}`,
  deletedClosedTasks: (ids: string): string => `Удалены закрытые задачи: ${ids}`,
  conflictedDuringSweep: (ids: string): string => `Задачи менялись во время прохода, повторю при следующем: ${ids}`,
  invalidAfterSweep: (detail: string): string => `Не удалось обновить задачи, исправьте файлы: ${detail}`,

  transcriptsScanFailed: (detail: string): string => `Не удалось прочитать расшифровки Claude Code: ${detail}`,
  watcherError: (root: string, detail: string): string => `Наблюдатель за каталогом ${root}: ${detail}`,

  listenFailed: (reason: string): string => `p-backlog не запустился: ${reason}`,
  portBusy: (port: number): string => `порт ${port} уже занят`,

  codeCacheReadFailed: (detail: string): string => `Не удалось прочитать кэш git: ${detail}`,
  codeCacheWriteFailed: (detail: string): string => `Не удалось сохранить кэш git: ${detail}`,
  journalReadFailed: (path: string, detail: string): string => `Не удалось прочитать журнал ${path}, «Закрыты агентом» покажет и закрытые в вебе задачи проекта: ${detail}`,
};

export type ServerMessages = typeof serverRu;
