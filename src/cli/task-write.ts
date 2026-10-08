import { warnPathErrors } from "../core/errors";
import { buildIndex } from "../core/model/graph";
import type { Closure } from "../core/model/lifecycle";
import type { Task } from "../core/model/types";
import { updateTaskInIndex, type TaskChanges } from "../core/store/update";
import type { UpdateTaskFailure } from "../core/store/write-result";
import { EXIT, type CliIo, type ExitCode } from "./io";

export type TaskWrite = { ok: true; task: Task } | { ok: false; exitCode: ExitCode };

export type TaskWriter = (task: Task, changes: TaskChanges, closure?: Closure) => Promise<TaskWrite>;

export function taskWriter(io: CliIo, loadedTasks: readonly Task[]): TaskWriter {
  const index = buildIndex(loadedTasks);
  const onError = warnPathErrors(io.warn);
  return async (task, changes, closure) => {
    const result = await updateTaskInIndex(index, { id: task.id, changes, expectedVersion: task.version, now: io.now(), via: "cli", onError, closure });
    if (!result.ok) return { ok: false, exitCode: reportUpdateFailure(io, task.id, result) };
    if (result.reopenedEpic !== undefined) io.warn(io.cli.epicReopened(result.reopenedEpic.id));
    return { ok: true, task: result.task };
  };
}

function reportUpdateFailure(io: CliIo, id: string, result: UpdateTaskFailure): ExitCode {
  switch (result.reason) {
    case "not-found":
      io.warn(io.cli.taskNotFound(id));
      return EXIT.notFound;
    case "conflict":
      io.warn(io.cli.fileConflict(id));
      return EXIT.invalid;
    case "busy":
      io.warn(io.core.fileBusy(result));
      return EXIT.failed;
    case "invalid":
      for (const problem of result.problems) io.warn(io.core.problem(problem));
      return EXIT.invalid;
  }
}
