import { parseArgs } from "node:util";
import { checklistItems } from "../../core/model/checklist";
import { TASK_STATUSES } from "../../core/model/types";
import { loadBacklog } from "../../core/store/load";
import { EXIT, parseChoice, UsageError, withUsageErrors, type CliIo } from "../io";
import { requireTask } from "../lookups";
import { writeTask } from "../task-write";

export async function runStatus(args: string[], io: CliIo): Promise<number> {
  const { positionals } = withUsageErrors(() => parseArgs({ args, allowPositionals: true, options: {} }));
  const [id, status, ...rest] = positionals;
  if (id === undefined || status === undefined || rest.length > 0) {
    throw new UsageError(`Использование: backlog status <ID> <${TASK_STATUSES.join("|")}>`);
  }
  const nextStatus = parseChoice(status, TASK_STATUSES, "статус");

  const loaded = await loadBacklog(io.backlogRoot);
  const task = requireTask(loaded, io, id);
  if (!task) return EXIT.notFound;
  const written = await writeTask(io, task, { status: nextStatus });
  if (!written.ok) return written.exitCode;

  const uncheckedCount = checklistItems(task.body).filter((item) => !item.checked).length;
  if (nextStatus === "done" && uncheckedCount > 0) io.warn(`Внимание: не отмечено пунктов чеклиста — ${uncheckedCount}`);
  io.print(`${id}: ${task.status} → ${nextStatus}`);
  return EXIT.ok;
}
