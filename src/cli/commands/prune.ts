import { parseArgs } from "node:util";
import { staleLowTasks, STALE_LOW_DAYS } from "../../core/model/query";
import { formatDayMonth } from "../../core/stats/format";
import { loadBacklog } from "../../core/store/load";
import { EXIT, UsageError, withUsageErrors, type CliIo } from "../io";
import { resolveScope, SCOPE_OPTIONS } from "../scope-options";
import { writeTask } from "../task-write";

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
    const written = await writeTask(io, task, { status: "cancelled" }, { resolution: "obsolete", reason: PRUNE_REASON });
    if (!written.ok) return written.exitCode;
    io.print(`${task.id}: отменена`);
  }
  return EXIT.ok;
}
