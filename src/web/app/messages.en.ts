import { pluralEn } from "../../core/i18n/plural";
import type { AppMessages } from "./messages.ru";

export const appEn: AppMessages = {
  crashTitle: "The backlog interface crashed",
  crashHint: "Reload the page. If the error keeps happening, restart the backlog server.",
  serverErrorPrefixed: (message) => `Server returned an error: ${message}. Retry; if it keeps failing, restart the backlog server.`,
  serverStatusError: (status) => `Server returned an error ${status}. Retry; if it keeps failing, restart the backlog server.`,
  unreachableMessage: (command) => ["The backlog server is not responding. Start it: ", command("backlog serve"), " — or install it as a service so it starts on its own: ", command("backlog service install")],
  scopeNote: (activeCount, totalCount) => `${activeCount} of ${totalCount} ${pluralEn(totalCount, "project", "projects")} included`,
  bootLoadError: "Couldn't load the interface — reload the page",
  bootSettingsError: "Backlog server is not responding",
  bootRetry: "Retry",
};
