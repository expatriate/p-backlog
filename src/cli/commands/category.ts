import { parseArgs } from "node:util";
import { coreMessages } from "../../core/messages";
import { TASK_CATEGORIES } from "../../core/model/types";
import { loadBacklog } from "../../core/store/load";
import { usageError, type CliCommand } from "../command";
import { EXIT, parseChoice, withUsageErrors, type CliIo } from "../io";
import { requireTask } from "../lookups";
import { taskWriter } from "../task-write";

const NO_CATEGORY = "none";

export const categoryCommand: CliCommand = {
  name: "category",
  usage: [`<ID> <${TASK_CATEGORIES.join("|")}|${NO_CATEGORY}>`],
  run: runCategory,
};

async function runCategory(args: string[], io: CliIo): Promise<number> {
  const { positionals } = withUsageErrors(() => parseArgs({ args, allowPositionals: true, options: {} }));
  const [id, value, ...rest] = positionals;
  if (id === undefined || value === undefined || rest.length > 0) throw usageError(categoryCommand);
  const category = value === NO_CATEGORY ? null : parseChoice(value, TASK_CATEGORIES, "категория");

  const loaded = await loadBacklog(io.backlogRoot);
  const task = requireTask(loaded, io, id);
  if (!task) return EXIT.notFound;
  const written = await taskWriter(io, loaded.tasks)(task, { category });
  if (!written.ok) return written.exitCode;
  const messages = coreMessages(io.language);
  io.print(`${id}: ${messages.categoryLabel(task.category)} → ${messages.categoryLabel(written.task.category)}`);
  return EXIT.ok;
}
