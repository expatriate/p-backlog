import { formatDayMonth } from "../../core/i18n/format";
import { staleLowTasks, STALE_LOW_DAYS } from "../../core/model/query";
import { loadBacklog } from "../../core/store/load";
import type { CliCommand } from "../command";
import { EXIT, parseOptions, type CliIo, type ExitCode } from "../io";
import { applyAll } from "../apply-all";
import { cliMessages } from "../messages";
import { resolveScope, SCOPE_OPTIONS } from "../scope-options";
import { taskWriter } from "../task-write";

export const pruneCommand: CliCommand = {
  name: "prune",
  usage: (language) => [cliMessages(language).pruneUsage(STALE_LOW_DAYS)],
  run: runPrune,
};

async function runPrune(args: string[], io: CliIo): Promise<ExitCode> {
  const values = parseOptions(io.language, args, { ...SCOPE_OPTIONS, apply: { type: "boolean", default: false } });

  const loaded = await loadBacklog(io.backlogRoot);
  const scope = resolveScope(loaded, io, values);
  if (scope === null) return EXIT.notFound;
  const { projectIds } = scope;
  const stale = staleLowTasks(
    loaded.tasks.filter((task) => projectIds.includes(task.projectId)),
    io.now(),
  );
  if (stale.length === 0) {
    io.print(io.cli.noStaleTasks);
    return EXIT.ok;
  }
  if (!values.apply) {
    for (const task of stale) io.print(io.cli.staleTaskLine(task.id, task.title, formatDayMonth(io.language, new Date(task.created))));
    io.print(io.cli.cancelStaleHint);
    return EXIT.ok;
  }

  const write = taskWriter(io, loaded.tasks);
  return applyAll(stale, async (task) => {
    const written = await write(task, { status: "cancelled" }, { resolution: "obsolete", reason: io.cli.pruneReason(STALE_LOW_DAYS) });
    if (!written.ok) return written.exitCode;
    io.print(io.cli.taskCancelled(task.id));
    return EXIT.ok;
  });
}
