import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { buildIndex } from "../../core/model/graph";
import { coreMessages } from "../../core/messages";
import type { Task } from "../../core/model/types";
import { loadBacklog } from "../../core/store/load";
import { describeTask, toJson } from "../describe";
import { formatTaskDetails } from "../format";
import { usageError, type CliCommand } from "../command";
import { EXIT, withUsageErrors, type CliIo } from "../io";
import { requireTask } from "../lookups";
import { cliMessages } from "../messages";

export const showCommand: CliCommand = {
  name: "show",
  usage: () => ["<ID> [--json]"],
  run: runShow,
};

async function runShow(args: string[], io: CliIo): Promise<number> {
  const { values, positionals } = withUsageErrors(() =>
    parseArgs({ args, allowPositionals: true, options: { json: { type: "boolean", default: false } } }),
  );
  const [id, ...rest] = positionals;
  if (id === undefined || rest.length > 0) throw usageError(showCommand, io.language);

  const loaded = await loadBacklog(io.backlogRoot);
  const task = requireTask(loaded, io, id);
  if (!task) return EXIT.notFound;
  await printTask(io, task, loaded.tasks, { json: values.json });
  return EXIT.ok;
}

export async function printTask(io: CliIo, task: Task, tasks: readonly Task[], { json }: { json: boolean }): Promise<void> {
  if (json) {
    io.print(JSON.stringify(taskJson(task, tasks), null, 2));
    return;
  }
  const description = describeTask(task, buildIndex(tasks));
  io.print(formatTaskDetails(coreMessages(io.language), cliMessages(io.language), description, await readFile(task.path, "utf8")));
}

export function taskJson(task: Task, tasks: readonly Task[]): object {
  return toJson(describeTask(task, buildIndex(tasks)));
}
