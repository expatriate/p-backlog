import { parseArgs } from "node:util";
import { PRIORITIES, TASK_TYPES } from "../../core/model/types";
import { createTask } from "../../core/store/create";
import { loadBacklog } from "../../core/store/load";
import { EXIT, parseChoice, splitList, UsageError, withUsageErrors, type CliIo } from "../io";
import { ensureProject } from "../lookups";

export async function runNew(args: string[], io: CliIo): Promise<number> {
  const { values, positionals } = withUsageErrors(() =>
    parseArgs({
      args,
      allowPositionals: true,
      options: {
        title: { type: "string" },
        type: { type: "string" },
        priority: { type: "string" },
        tags: { type: "string" },
        source: { type: "string" },
        epic: { type: "string" },
        "blocked-by": { type: "string" },
        related: { type: "string" },
        project: { type: "string" },
        json: { type: "boolean", default: false },
      },
    }),
  );
  if (positionals.length > 0) throw new UsageError(`Лишние аргументы: ${positionals.join(" ")}`);
  if (values.title === undefined) throw new UsageError("--title обязателен");
  const type = values.type === undefined ? undefined : parseChoice(values.type, TASK_TYPES, "--type");
  const priority = values.priority === undefined ? undefined : parseChoice(values.priority, PRIORITIES, "--priority");

  const loaded = await loadBacklog(io.backlogRoot);
  const project = await ensureProject(loaded, io, values.project);
  if (!project) return EXIT.notFound;

  const result = await createTask(io.backlogRoot, {
    project,
    input: {
      title: values.title,
      type,
      priority,
      tags: splitList(values.tags),
      source: values.source,
      epic: values.epic,
      blockedBy: splitList(values["blocked-by"]),
      related: splitList(values.related),
      body: await io.readStdin(),
    },
    existingTasks: loaded.tasks,
    now: io.now(),
  });
  if (!result.ok) {
    for (const error of result.errors) io.warn(error);
    return EXIT.invalid;
  }
  io.print(values.json ? JSON.stringify(result.task, null, 2) : `${result.task.id} ${result.task.path}`);
  return EXIT.ok;
}
