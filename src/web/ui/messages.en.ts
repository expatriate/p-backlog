import type { UiMessages } from "./messages.ru";

export const uiEn: UiMessages = {
  cancel: "Cancel",
  close: "Close",
  progress: "Progress",
  retry: "Retry",
  retrying: "Retrying…",
  deletionDelayed: "deletion delayed",
  deletionDelayedTitle: (dayMonth) =>
    `was due to be deleted ${dayMonth}; the deletion pass holds the task until its epic is closed or the backlog is fixed`,
  deletesToday: "deletes today",
  deletesInDays: (days) => `deletes in ${days} d.`,
  deletesOn: (dayMonth) => `deletes ${dayMonth}`,
};
