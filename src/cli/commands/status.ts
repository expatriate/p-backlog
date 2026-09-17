import { parseArgs } from "node:util";
import { checklistItems } from "../../core/model/checklist";
import { TASK_STATUSES } from "../../core/model/types";
import { loadBacklog } from "../../core/store/load";
import { updateTask } from "../../core/store/update";
import { EXIT, parseChoice, UsageError, withUsageErrors, type CliIo } from "../io";
import { requireTask } from "../lookups";
import { reportUpdateFailure } from "../update-failure";

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
  const result = await updateTask(io.backlogRoot, { id, changes: { status: nextStatus }, expectedVersion: task.version });
  if (!result.ok) return reportUpdateFailure(io, id, result);

  const uncheckedCount = checklistItems(task.body).filter((item) => !item.checked).length;
  if (nextStatus === "done" && uncheckedCount > 0) io.warn(`Внимание: не отмечено пунктов чеклиста — ${uncheckedCount}`);
  io.print(`${id}: ${task.status} → ${nextStatus}`);
  return EXIT.ok;
}
