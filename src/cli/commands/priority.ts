import { parseArgs } from "node:util";
import { PRIORITIES } from "../../core/model/types";
import { loadBacklog } from "../../core/store/load";
import { EXIT, parseChoice, UsageError, withUsageErrors, type CliIo } from "../io";
import { requireTask } from "../lookups";
import { writeTask } from "../task-write";

export async function runPriority(args: string[], io: CliIo): Promise<number> {
  const { positionals } = withUsageErrors(() => parseArgs({ args, allowPositionals: true, options: {} }));
  const [id, value, ...rest] = positionals;
  if (id === undefined || value === undefined || rest.length > 0) {
    throw new UsageError(`Использование: backlog priority <ID> <${PRIORITIES.join("|")}>`);
  }
  const priority = parseChoice(value, PRIORITIES, "приоритет");

  const loaded = await loadBacklog(io.backlogRoot);
  const task = requireTask(loaded, io, id);
  if (!task) return EXIT.notFound;
  const written = await writeTask(io, task, { priority });
  if (!written.ok) return written.exitCode;
  io.print(`${id}: ${task.priority} → ${written.task.priority}`);
  return EXIT.ok;
}
