import type { Problem } from "../model/problems";

export type CheckFix =
  | { kind: "references-removed"; taskId: string; ids: string[] }
  | { kind: "epic-closed"; taskId: string; childIds: string[] }
  | { kind: "epic-reopened"; taskId: string; childIds: string[] }
  | { kind: "source-moved"; taskId: string; from: string; to: string };

export type CheckProblem =
  | { kind: "fix-failed"; taskId: string; cause: "changed-during-check" | "gone-during-check" }
  | { kind: "fix-failed"; taskId: string; cause: "invalid"; problems: Problem[] }
  | { kind: "task-invalid"; taskId: string; problem: Problem }
  | { kind: "file-not-parsed"; path: string; problems: Problem[] }
  | { kind: "epics-wait-for-files"; epicIds: string[] }
  | { kind: "project-without-repos"; projectId: string }
  | { kind: "project-repos-missing"; projectId: string; repos: string[] }
  | { kind: "project-repo-not-git"; projectId: string; repo: string }
  | { kind: "project-history-unreadable"; projectId: string; repo: string }
  | { kind: "prefix-shared"; prefix: string; projectIds: string[] };
