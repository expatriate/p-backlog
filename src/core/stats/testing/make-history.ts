import type { TaskHistory } from "../history";

export function makeHistory(overrides: Partial<TaskHistory> = {}): TaskHistory {
  return { id: "", projectId: "", type: "task", createdAt: 0, finalStatus: "backlog", transitions: [], candidates: [], verifications: [], filtered: [], ...overrides };
}
