import { emptyHistory, type TaskHistory } from "../history";

export function makeHistory(overrides: Partial<TaskHistory> = {}): TaskHistory {
  return { ...emptyHistory(), ...overrides };
}
