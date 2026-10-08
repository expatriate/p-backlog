import type { Problem } from "../model/problems";
import type { Task } from "../model/types";
import type { LockBusy } from "./file-lock";

export type Invalid = { ok: false; reason: "invalid"; problems: Problem[] };

export type WrittenTask = { task: Task; reopenedEpic?: Task | undefined };

type Written = { ok: true } & WrittenTask;

export type CreateTaskResult = Written | Invalid;

type Busy = { ok: false; reason: "busy" } & LockBusy;

export type UpdateTaskFailure = Invalid | Busy | { ok: false; reason: "not-found" } | { ok: false; reason: "conflict"; current: Task };

export type UpdateTaskResult = Written | UpdateTaskFailure;

export function writtenTasks({ task, reopenedEpic }: WrittenTask): Task[] {
  return reopenedEpic === undefined ? [task] : [task, reopenedEpic];
}

export function invalid(problems: Problem[]): Invalid {
  return { ok: false, reason: "invalid", problems };
}
