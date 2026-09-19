import type { Closure } from "../core/model/lifecycle";
import type { Task } from "../core/model/types";
import { updateTask, type TaskChanges } from "../core/store/update";
import type { CliIo } from "./io";
import { reportUpdateFailure } from "./update-failure";

export type TaskWrite = { ok: true; task: Task } | { ok: false; exitCode: number };

export async function writeTask(io: CliIo, task: Task, changes: TaskChanges, closure?: Closure): Promise<TaskWrite> {
  const result = await updateTask(io.backlogRoot, { id: task.id, changes, expectedVersion: task.version, now: io.now(), via: "cli", closure });
  return result.ok ? { ok: true, task: result.task } : { ok: false, exitCode: reportUpdateFailure(io, task.id, result) };
}
