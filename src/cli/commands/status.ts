import { parseArgs } from "node:util";
import { checklistItems } from "../../core/model/checklist";
import { TASK_STATUSES } from "../../core/model/types";
import { loadBacklog } from "../../core/store/load";
import { usageError, type CliCommand } from "../command";
import { EXIT, parseChoice, withUsageErrors, type CliIo } from "../io";
import { requireTask } from "../lookups";
import { cliMessages } from "../messages";
import { taskWriter } from "../task-write";

export const statusCommand: CliCommand = {
  name: "status",
  usage: () => [`<ID> <${TASK_STATUSES.join("|")}>`],
  run: runStatus,
};

async function runStatus(args: string[], io: CliIo): Promise<number> {
  const { positionals } = withUsageErrors(() => parseArgs({ args, allowPositionals: true, options: {} }));
  const [id, status, ...rest] = positionals;
  if (id === undefined || status === undefined || rest.length > 0) throw usageError(statusCommand, io.language);
  const nextStatus = parseChoice(io.language, status, TASK_STATUSES, cliMessages(io.language).optionLabel.status);

  const loaded = await loadBacklog(io.backlogRoot);
  const task = requireTask(loaded, io, id);
  if (!task) return EXIT.notFound;
  const written = await taskWriter(io, loaded.tasks)(task, { status: nextStatus });
  if (!written.ok) return written.exitCode;

  const uncheckedCount = checklistItems(task.body).filter((item) => !item.checked).length;
  if (nextStatus === "done" && uncheckedCount > 0) io.warn(cliMessages(io.language).checklistWarning(uncheckedCount));
  io.print(`${id}: ${task.status} → ${nextStatus}`);
  return EXIT.ok;
}
