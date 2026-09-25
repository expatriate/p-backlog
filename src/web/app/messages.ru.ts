import { countRu, NBSP } from "../../core/i18n/plural";

export const appRu = {
  crashTitle: "Интерфейс беклога сломался",
  crashHint: "Обновите страницу. Если ошибка повторится, перезапустите сервер беклога.",
  serverErrorPrefixed: (message: string): string => `Сервер вернул ошибку: ${message}`,
  serverStatusError: (status: number): string =>
    `Сервер вернул ошибку ${status}. Повторите; если не проходит — перезапустите сервер беклога.`,
  unreachableMessage: <T,>(command: (text: string) => T): Array<string | T> => [
    "Сервер беклога не отвечает. Запустите его: ",
    command("npm start"),
    " в репозитории p-backlog или, если установлен LaunchAgent из README, ",
    command("launchctl kickstart -k gui/$(id -u)/local.p-backlog"),
  ],
  scopeNote: (activeCount: number, totalCount: number): string =>
    `учтено ${activeCount} из${NBSP}${countRu(totalCount, "проекта", "проектов", "проектов")}`,
  bootLoadError: "Не удалось загрузить интерфейс — обновите страницу",
  bootSettingsError: "Сервер беклога не отвечает",
  bootRetry: "Повторить",
};

export type AppMessages = typeof appRu;
