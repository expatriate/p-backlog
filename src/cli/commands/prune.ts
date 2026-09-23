import { staleLowTasks, STALE_LOW_DAYS } from "../../core/model/query";
import { formatDayMonth } from "../../core/stats/format";
import { loadBacklog } from "../../core/store/load";
import type { CliCommand } from "../command";
import { EXIT, parseOptions, type CliIo } from "../io";
import { applyAll } from "../apply-all";
import { resolveScope, SCOPE_OPTIONS } from "../scope-options";
import { taskWriter } from "../task-write";

const PRUNE_REASON = `Низкий приоритет, не брали в работу ${STALE_LOW_DAYS}+ дней (backlog prune)`;

export const pruneCommand: CliCommand = {
  name: "prune",
  usage: [`[--project id | --all-projects] [--apply]   (задачи с низким приоритетом старше ${STALE_LOW_DAYS} дней)`],
  run: runPrune,
};

async function runPrune(args: string[], io: CliIo): Promise<number> {
  const values = parseOptions(args, { ...SCOPE_OPTIONS, apply: { type: "boolean", default: false } });

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

  const write = taskWriter(io, loaded.tasks);
  return applyAll(stale, async (task) => {
    const written = await write(task, { status: "cancelled" }, { resolution: "obsolete", reason: PRUNE_REASON });
    if (!written.ok) return written.exitCode;
    io.print(`${task.id}: отменена`);
    return EXIT.ok;
  });
}
