import { pluralEn } from "../../core/i18n/plural";
import type { AppMessages } from "./messages.ru";

export const appEn: AppMessages = {
  crashTitle: "The backlog interface crashed",
  crashHint: "Reload the page. If the error keeps happening, restart the backlog server.",
  serverErrorPrefixed: (message) => `Server returned an error: ${message}`,
  serverStatusError: (status) => `Server returned an error ${status}. Retry; if it keeps failing, restart the backlog server.`,
  unreachableMessage: (command) => [
    "The backlog server is not responding. Start it: ",
    command("npm start"),
    " in the p-backlog repository, or, if you installed the LaunchAgent from the README, ",
    command("launchctl kickstart -k gui/$(id -u)/local.p-backlog"),
  ],
  scopeNote: (activeCount, totalCount) => `${activeCount} of ${totalCount} ${pluralEn(totalCount, "project", "projects")} included`,
  bootLoadError: "Couldn't load the interface — reload the page",
  bootSettingsError: "Backlog server is not responding",
  bootRetry: "Retry",
};
