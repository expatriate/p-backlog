import { flowForecast } from "../../core/stats/flow/forecast";
import { reportContext } from "../../core/stats/scope";
import { statsReport } from "../../core/stats/report";
import { statsSignals } from "../../core/stats/signals/signals";
import { readJournals } from "../../core/store/journal";
import { loadBacklog, unparsedTasks } from "../../core/store/load";
import type { CliCommand } from "../command";
import { EXIT, parseOptions, type CliIo, type ExitCode } from "../io";
import { resolveScope, SCOPE_OPTIONS } from "../scope-options";
import { statsSummary } from "../stats-summary";
import { servicePortOf } from "../service/managers";
import { statsPath } from "../../core/api/web-paths";

export const statsCommand: CliCommand = {
  name: "stats",
  usage: () => ["[--project id | --all-projects] [--json]"],
  run: runStats,
};

async function runStats(args: string[], io: CliIo): Promise<ExitCode> {
  const values = parseOptions(io.language, args, { ...SCOPE_OPTIONS, json: { type: "boolean", default: false } });

  const loaded = await loadBacklog(io.backlogRoot);
  const scope = resolveScope(loaded, io, values);
  if (scope === null) return EXIT.notFound;
  const { project } = scope;

  const journals = await readJournals(io.backlogRoot, scope.activeIds);
  const inScope = new Set(scope.activeIds);
  const scoped = (task: { projectId: string }) => inScope.has(task.projectId);
  const input = { tasks: loaded.tasks.filter(scoped), journals, now: io.now(), projectId: project?.id, unparsedTasks: unparsedTasks(loaded.errors).filter(scoped) };
  const context = reportContext(input);
  const { totals } = statsReport(context);
  const forecast = flowForecast(context.histories, totals.open, io.now());
  const signals = statsSignals(context);

  if (values.json) {
    io.print(
      JSON.stringify(
        { totals, forecast, signals, unparsedTasks: context.head.unparsedTasks, invalidJournalLines: context.head.invalidJournalLines, unknownJournalLines: context.head.unknownJournalLines },
        null,
        2,
      ),
    );
    return EXIT.ok;
  }
  io.print(
    statsSummary({
      cli: io.cli,
      core: io.core,
      scopeName: project?.name ?? io.cli.projectsFallbackName,
      head: context.head,
      totals,
      forecast,
      signals,
      url: `http://localhost:${await servicePortOf(io)}${statsPath(project?.id)}`,
    }),
  );
  return EXIT.ok;
}
