export const serverRu = {
  taskNotFound: (id: string): string => `Задача ${id} не найдена`,
  taskChangedOnDisk: "Задача изменилась на диске",
  projectNotFound: (id: string): string => `Проект ${id} не найден`,
  confirmMismatch: "Подтверждение не совпадает с id проекта",
  bodyNotParsed: "Тело запроса не разобрано: ожидается JSON",
  unknownRoute: (path: string): string => `Неизвестный адрес API: ${path}`,
  hostRejected: (host: string): string => `Запросы с хоста ${host} не принимаются`,
  jsonContentTypeExpected: "Ожидается Content-Type: application/json",

  runsTrimFailed: (detail: string): string => `Не удалось обрезать журнал запусков: ${detail}`,
  serverStarted: (port: number, root: string): string => `p-backlog: http://localhost:${port}\nКаталог беклога: ${root}\n`,
  settingsFileInvalid: (path: string): string => `${path} не разобран, язык для этого запуска определён автоматически. Файл не изменён — поправьте его вручную.`,

  sweepFailed: (detail: string): string => `Не удалось удалить закрытые задачи: ${detail}`,
  closedEpics: (ids: string): string => `Закрыты завершённые эпики: ${ids}`,
  epicsBlockedByFiles: (paths: string): string => `Эпики не закрываются, пока не разобраны файлы: ${paths}`,
  deletedClosedTasks: (ids: string): string => `Удалены закрытые задачи: ${ids}`,
  conflictedDuringSweep: (ids: string): string => `Задачи менялись во время прохода, повторю при следующем: ${ids}`,
  invalidAfterSweep: (detail: string): string => `Не удалось обновить задачи, исправьте файлы: ${detail}`,

  transcriptsScanFailed: (detail: string): string => `Не удалось прочитать расшифровки Claude Code: ${detail}`,
  watcherError: (root: string, detail: string): string => `Наблюдатель за каталогом ${root}: ${detail}`,

  invalidPort: (source: string, value: string): string => `${source}: ожидается число от 1 до 65535, получено «${value}»`,
  listenFailed: (reason: string): string => `p-backlog не запустился: ${reason}`,
  portBusy: (port: number): string => `порт ${port} уже занят`,

  codeCacheReadFailed: (detail: string): string => `Не удалось прочитать кэш git: ${detail}`,
  codeCacheWriteFailed: (detail: string): string => `Не удалось сохранить кэш git: ${detail}`,
};

export type ServerMessages = typeof serverRu;
