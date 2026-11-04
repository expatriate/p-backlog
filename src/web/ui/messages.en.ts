import type { UiMessages } from "./messages.ru";

export const uiEn: UiMessages = {
  cancel: "Cancel",
  close: "Close",
  progress: "Progress",
  retry: "Retry",
  retrying: "Retrying…",
  deletionDelayed: "deletion delayed",
  deletionDelayedTitle: (dayMonth) => `was due to be deleted ${dayMonth}; the next cleanup will delete it`,
  deletesAfterEpic: (epic) => `deletes after epic ${epic}`,
  deletesAfterEpicTitle: (days) => `tasks of an open epic are kept until the epic closes, then for ${days} more d.`,
  deletesToday: "deletes today",
  deletesInDays: (days) => `deletes in ${days} d.`,
  deletesOn: (dayMonth) => `deletes ${dayMonth}`,
};
