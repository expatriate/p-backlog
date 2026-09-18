import { parseArgs } from "node:util";
import { categoryLabel } from "../../core/model/categories";
import { TASK_CATEGORIES } from "../../core/model/types";
import { loadBacklog } from "../../core/store/load";
import { updateTask } from "../../core/store/update";
import { EXIT, parseChoice, UsageError, withUsageErrors, type CliIo } from "../io";
import { requireTask } from "../lookups";
import { reportUpdateFailure } from "../update-failure";

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
  const result = await updateTask(io.backlogRoot, { id, changes: { category }, expectedVersion: task.version, now: io.now(), via: "cli" });
  if (!result.ok) return reportUpdateFailure(io, id, result);
  io.print(`${id}: ${categoryLabel(task.category)} → ${categoryLabel(result.task.category)}`);
  return EXIT.ok;
}
