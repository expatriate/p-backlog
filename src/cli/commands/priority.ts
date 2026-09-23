import { parseArgs } from "node:util";
import { PRIORITIES } from "../../core/model/types";
import { loadBacklog } from "../../core/store/load";
import { usageError, type CliCommand } from "../command";
import { EXIT, parseChoice, withUsageErrors, type CliIo } from "../io";
import { requireTask } from "../lookups";
import { cliMessages } from "../messages";
import { taskWriter } from "../task-write";

export const priorityCommand: CliCommand = {
  name: "priority",
  usage: () => [`<ID> <${PRIORITIES.join("|")}>`],
  run: runPriority,
};

async function runPriority(args: string[], io: CliIo): Promise<number> {
  const { positionals } = withUsageErrors(() => parseArgs({ args, allowPositionals: true, options: {} }));
  const [id, value, ...rest] = positionals;
  if (id === undefined || value === undefined || rest.length > 0) throw usageError(priorityCommand, io.language);
  const priority = parseChoice(io.language, value, PRIORITIES, cliMessages(io.language).optionLabel.priority);

  const loaded = await loadBacklog(io.backlogRoot);
  const task = requireTask(loaded, io, id);
  if (!task) return EXIT.notFound;
  const written = await taskWriter(io, loaded.tasks)(task, { priority });
  if (!written.ok) return written.exitCode;
  io.print(`${id}: ${task.priority} → ${written.task.priority}`);
  return EXIT.ok;
}
