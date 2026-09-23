import { buildIndex } from "../core/model/graph";
import type { Closure } from "../core/model/lifecycle";
import type { Task } from "../core/model/types";
import { updateTaskInIndex, type TaskChanges } from "../core/store/update";
import type { CliIo } from "./io";
import { reportUpdateFailure } from "./update-failure";

export type TaskWrite = { ok: true; task: Task } | { ok: false; exitCode: number };

export type TaskWriter = (task: Task, changes: TaskChanges, closure?: Closure) => Promise<TaskWrite>;

export function taskWriter(io: CliIo, loadedTasks: readonly Task[]): TaskWriter {
  const index = buildIndex(loadedTasks);
  return async (task, changes, closure) => {
    const result = await updateTaskInIndex(index, { id: task.id, changes, expectedVersion: task.version, now: io.now(), via: "cli", closure });
    return result.ok ? { ok: true, task: result.task } : { ok: false, exitCode: reportUpdateFailure(io, task.id, result) };
  };
}
