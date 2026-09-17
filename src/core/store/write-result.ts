import type { Task } from "../model/types";

export type Invalid = { ok: false; reason: "invalid"; errors: string[] };

export type CreateTaskResult = { ok: true; task: Task } | Invalid;

export type UpdateTaskResult =
  | { ok: true; task: Task }
  | Invalid
  | { ok: false; reason: "not-found" }
  | { ok: false; reason: "conflict"; current: Task };

export function invalid(errors: string[]): Invalid {
  return { ok: false, reason: "invalid", errors };
}
