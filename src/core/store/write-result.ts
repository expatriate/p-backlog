import type { Task } from "../model/types";

export type Invalid = { ok: false; reason: "invalid"; errors: string[] };

export type CreateTaskResult = { ok: true; task: Task } | Invalid;

export type UpdateTaskFailure = Invalid | { ok: false; reason: "not-found" } | { ok: false; reason: "conflict"; current: Task };

export type UpdateTaskResult = { ok: true; task: Task } | UpdateTaskFailure;

export function invalid(errors: string[]): Invalid {
  return { ok: false, reason: "invalid", errors };
}
