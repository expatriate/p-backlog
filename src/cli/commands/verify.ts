import { parseArgs } from "node:util";
import { formatLocalIso } from "../../core/model/dates";
import { isClosed } from "../../core/model/graph";
import { loadBacklog } from "../../core/store/load";
import { updateTask } from "../../core/store/update";
import { EXIT, UsageError, withUsageErrors, type CliIo } from "../io";
import { requireTask } from "../lookups";
import { reportUpdateFailure } from "../update-failure";

export async function runVerify(args: string[], io: CliIo): Promise<number> {
  const { values, positionals } = withUsageErrors(() =>
    parseArgs({ args, allowPositionals: true, options: { source: { type: "string" } } }),
  );
  const [id, ...rest] = positionals;
  if (id === undefined || rest.length > 0) throw new UsageError("Использование: backlog verify <ID> [--source файл:строка]");
  const source = values.source?.trim();
  if (source === "") throw new UsageError("--source не может быть пустым");

  const loaded = await loadBacklog(io.backlogRoot);
  const task = requireTask(loaded, io, id);
  if (!task) return EXIT.notFound;
  if (isClosed(task.status)) {
    io.warn(`${id} уже в статусе ${task.status}: подтверждать нечего`);
    return EXIT.refused;
  }

  const now = io.now();
  const result = await updateTask(io.backlogRoot, {
    id,
    changes: { verified: formatLocalIso(now), source },
    expectedVersion: task.version,
    now,
  });
  if (!result.ok) return reportUpdateFailure(io, id, result);
  io.print(source === undefined ? `${id}: подтверждена` : `${id}: подтверждена, source → ${source}`);
  return EXIT.ok;
}
