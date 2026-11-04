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

export function withWrittenTasks(tasks: readonly Task[], results: readonly WrittenTask[]): Task[] {
  const written = results.flatMap(writtenTasks);
  const byId = new Map(written.map((task) => [task.id, task]));
  const known = new Set(tasks.map((task) => task.id));
  return [...tasks.map((task) => byId.get(task.id) ?? task), ...written.filter((task) => !known.has(task.id))];
}

export function invalid(problems: Problem[]): Invalid {
  return { ok: false, reason: "invalid", problems };
}
