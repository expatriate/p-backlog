import { parseArgs } from "node:util";
import { staleLowTasks, STALE_LOW_DAYS } from "../../core/model/query";
import { formatDayMonth } from "../../core/stats/format";
import { loadBacklog } from "../../core/store/load";
import { updateTask } from "../../core/store/update";
import { EXIT, UsageError, withUsageErrors, type CliIo } from "../io";
import { resolveScope, SCOPE_OPTIONS } from "../scope-options";
import { reportUpdateFailure } from "../update-failure";

const PRUNE_REASON = `Низкий приоритет, не брали в работу ${STALE_LOW_DAYS}+ дней (backlog prune)`;

export async function runPrune(args: string[], io: CliIo): Promise<number> {
  const { values, positionals } = withUsageErrors(() =>
    parseArgs({
      args,
      allowPositionals: true,
      options: { ...SCOPE_OPTIONS, apply: { type: "boolean", default: false } },
    }),
  );
  if (positionals.length > 0) throw new UsageError(`Лишние аргументы: ${positionals.join(" ")}`);

  const loaded = await loadBacklog(io.backlogRoot);
  const scope = resolveScope(loaded, io, values);
  if (scope === null) return EXIT.notFound;
  const { projectIds } = scope;
  const stale = staleLowTasks(
    loaded.tasks.filter((task) => projectIds.includes(task.projectId)),
    io.now(),
  );
  if (stale.length === 0) {
    io.print("Застоявшихся задач нет");
    return EXIT.ok;
  }
  if (!values.apply) {
    for (const task of stale) io.print(`${task.id} — ${task.title} (создана ${formatDayMonth(new Date(task.created))})`);
    io.print("Отменить: backlog prune --apply");
    return EXIT.ok;
  }

  for (const task of stale) {
    const result = await updateTask(io.backlogRoot, {
      id: task.id,
      changes: { status: "cancelled" },
      expectedVersion: task.version,
      now: io.now(),
      via: "cli",
      closure: { resolution: "obsolete", reason: PRUNE_REASON },
    });
    if (!result.ok) return reportUpdateFailure(io, task.id, result);
    io.print(`${task.id}: отменена`);
  }
  return EXIT.ok;
}
