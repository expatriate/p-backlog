import { pluralEn } from "../../core/i18n/plural";
import { NBSP } from "../../core/stats/format";
import type { LayoutMessages } from "./messages.ru";

const graphNotesEn: LayoutMessages["graphNotes"] = {
  none: { title: "No code graph", hint: [{ code: "code-review-graph build" }, { text: " — check candidates are less precise" }] },
  stale: {
    title: "Code graph is stale",
    hint: [{ code: "code-review-graph watch" }, { text: " or the " }, { code: "update" }, { text: " hook — without them the check can't see symbols" }],
  },
  unreadable: { title: "Code graph unreadable", hint: [{ code: "code-review-graph build" }, { text: " again — the database is from a different version or path" }] },
};

export const layoutEn: LayoutMessages = {
  skipLink: "Skip to content",
  sidebarNav: "Navigation",
  brand: "backlog",
  sectionsLabel: "Sections",
  tasksNav: "Tasks",
  statsNav: "Statistics",
  signalsHidden: (n) => `, alerts: ${n}`,
  collapseProjects: "Collapse project list",
  expandProjects: "Expand project list",
  projects: "Projects",
  taskWord: (n) => pluralEn(n, "task", "tasks"),
  checkedSuffix: `${NBSP}— checked`,
  languageSwitchLabel: "Interface language",
  graphNotes: graphNotesEn,
  checkboxLabel: (name) => `Include project ${name} in the “Projects” scope`,
  setActiveFailed: (active) => (active ? "Failed to include the project" : "Failed to exclude the project"),
  deleteButtonLabel: (name) => `Delete project ${name}`,
  deleteButtonTitle: "Delete project",
  deleteFailed: "Failed to delete the project",
  deleteDialogTitle: (name) => `Delete project “${name}”?`,
  deleteDialogDescriptionUnknown: "The project directory will be deleted along with all its tasks; this cannot be undone.",
  deleteDialogDescription: (taskCount) => `Tasks: ${taskCount}. The project directory will be deleted along with them; this cannot be undone.`,
  confirmWordLabel: (id) => `Type the project id: ${id}`,
  confirmLabel: "Delete",
};
