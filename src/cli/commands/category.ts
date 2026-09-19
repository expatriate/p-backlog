import { parseArgs } from "node:util";
import { categoryLabel } from "../../core/model/categories";
import { TASK_CATEGORIES } from "../../core/model/types";
import { loadBacklog } from "../../core/store/load";
import { EXIT, parseChoice, UsageError, withUsageErrors, type CliIo } from "../io";
import { requireTask } from "../lookups";
import { writeTask } from "../task-write";

const NO_CATEGORY = "none";

export async function runCategory(args: string[], io: CliIo): Promise<number> {
  const { positionals } = withUsageErrors(() => parseArgs({ args, allowPositionals: true, options: {} }));
  const [id, value, ...rest] = positionals;
  if (id === undefined || value === undefined || rest.length > 0) {
    throw new UsageError(`Использование: backlog category <ID> <${TASK_CATEGORIES.join("|")}|${NO_CATEGORY}>`);
  }
  const category = value === NO_CATEGORY ? null : parseChoice(value, TASK_CATEGORIES, "категория");

  const loaded = await loadBacklog(io.backlogRoot);
  const task = requireTask(loaded, io, id);
  if (!task) return EXIT.notFound;
  const written = await writeTask(io, task, { category });
  if (!written.ok) return written.exitCode;
  io.print(`${id}: ${categoryLabel(task.category)} → ${categoryLabel(written.task.category)}`);
  return EXIT.ok;
}
