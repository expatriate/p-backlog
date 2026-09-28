import { readFile } from "node:fs/promises";
import { buildIndex } from "../../core/model/graph";
import type { Task } from "../../core/model/types";
import { loadBacklog } from "../../core/store/load";
import { describeTask, taskJson } from "../describe";
import { formatTaskDetails } from "../format";
import { usageError, type CliCommand } from "../command";
import { EXIT, parseCommandArgs, type CliIo, type ExitCode } from "../io";
import { findTaskOrWarn } from "../lookups";

export const showCommand: CliCommand = {
  name: "show",
  usage: () => ["<ID> [--json]"],
  run: runShow,
};

async function runShow(args: string[], io: CliIo): Promise<ExitCode> {
  const { values, positionals } = parseCommandArgs(io.language, args, { json: { type: "boolean", default: false } });
  const [id, ...rest] = positionals;
  if (id === undefined || rest.length > 0) throw usageError(showCommand, io.language);

  const loaded = await loadBacklog(io.backlogRoot);
  const task = findTaskOrWarn(loaded, io, id);
  if (!task) return EXIT.notFound;
  await printTask(io, task, loaded.tasks, { json: values.json });
  return EXIT.ok;
}

export async function printTask(io: CliIo, task: Task, tasks: readonly Task[], { json }: { json: boolean }): Promise<void> {
  const index = buildIndex(tasks);
  if (json) {
    io.print(JSON.stringify(taskJson(task, index), null, 2));
    return;
  }
  const description = describeTask(task, index);
  io.print(formatTaskDetails(io.core, io.cli, description, await readFile(task.path, "utf8")));
}
