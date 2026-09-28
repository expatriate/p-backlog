import type { Problem } from "../model/problems";
import type { Task } from "../model/types";

export type Invalid = { ok: false; reason: "invalid"; problems: Problem[] };

export type CreateTaskResult = { ok: true; task: Task } | Invalid;

type Busy = { ok: false; reason: "busy"; path: string; lock: string; seconds: number };

export type UpdateTaskFailure = Invalid | Busy | { ok: false; reason: "not-found" } | { ok: false; reason: "conflict"; current: Task };

export type UpdateTaskResult = { ok: true; task: Task; reopenedEpic?: Task | undefined } | UpdateTaskFailure;

export function invalid(problems: Problem[]): Invalid {
  return { ok: false, reason: "invalid", problems };
}
