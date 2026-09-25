import type { TaskMessages } from "./messages.ru";

export const taskEn: TaskMessages = {
  cardLabel: (id) => `Task ${id}`,
  title: "Task title",
  description: "Task description",
  leaveWithDraft: "Leave without saving the description?",
  createdLabel: "created",
  closedLabel: "Closed",
  restoreToBacklog: "Restore to backlog",
  saving: "Saving…",
  saved: "Saved",
  draftConflict: 'The description changed on disk while you were editing it. "Save" overwrites it with your text, "Cancel" shows the current one.',
  taskConflict: "The task changed on disk, the current version is shown. Repeat your edit.",
  fieldConflict: (field) => `"${field}" changed on disk while you were editing it. Your version is still in the field: leave the field once more to write it over.`,

  statusField: "Status",
  priorityField: "Priority",
  categoryField: "Category",
  typeField: "Type",
  epicField: "Epic",
  epicPlaceholder: "Epic ID",
  tagsField: "Comma-separated tags",
  typeLabels: { task: "task", epic: "epic" },

  save: "Save",
  editDescription: "Edit description",

  blockedByLabel: "Blocked by",
  relatedLabel: "Related",
  dependentsLabel: "Blocks",
  referrersLabel: "Referenced as related",
  epicChildrenLabel: "Epic tasks",

  refNotFound: "not found",
  removeRef: (id) => `Remove ${id}`,
  addRefPlaceholder: "Task ID",
  addRefLabel: (label) => `Add to "${label}"`,
  addRef: "Add",
  invalidRefId: (example) => `Enter a task ID, for example ${example}`,
  duplicateRef: (id) => `${id} is already in the list`,
};
