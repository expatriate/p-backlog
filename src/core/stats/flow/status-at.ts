import type { TaskStatus } from "../../model/types";
import type { TaskHistory } from "../history";

export function statusAt(history: TaskHistory, moment: number): TaskStatus {
  const last = history.transitions.filter((transition) => transition.at <= moment).at(-1);
  if (last !== undefined) return last.to;
  const first = history.transitions[0];
  if (first !== undefined) return first.from ?? "backlog";
  return history.finalStatus;
}
