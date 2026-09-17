import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { buildIndex } from "../../core/model/graph";
import type { Task } from "../../core/model/types";
import { loadBacklog } from "../../core/store/load";
import { describeTask, toJson } from "../describe";
import { formatTaskDetails } from "../format";
import { EXIT, UsageError, withUsageErrors, type CliIo } from "../io";
import { requireTask } from "../lookups";

export async function runShow(args: string[], io: CliIo): Promise<number> {
  const { values, positionals } = withUsageErrors(() =>
    parseArgs({ args, allowPositionals: true, options: { json: { type: "boolean", default: false } } }),
  );
  const [id, ...rest] = positionals;
  if (id === undefined || rest.length > 0) throw new UsageError("Использование: backlog show <ID>");

  const loaded = await loadBacklog(io.backlogRoot);
  const task = requireTask(loaded, io, id);
  if (!task) return EXIT.notFound;
  await printTask(io, task, loaded.tasks, { json: values.json });
  return EXIT.ok;
}

export async function printTask(io: CliIo, task: Task, tasks: readonly Task[], { json }: { json: boolean }): Promise<void> {
  const description = describeTask(task, tasks, buildIndex(tasks));
  io.print(json ? JSON.stringify(toJson(description), null, 2) : formatTaskDetails(description, await readFile(task.path, "utf8")));
}
