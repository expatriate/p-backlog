import { flowForecast } from "../../core/stats/flow/forecast";
import { reportContext } from "../../core/stats/scope";
import { statsReport } from "../../core/stats/report";
import { statsSignals } from "../../core/stats/signals/signals";
import { readJournals } from "../../core/store/journal";
import { loadBacklog, unparsedTasks } from "../../core/store/load";
import { statsPath } from "../../core/api/web-paths";
import { browserOrigin } from "../../server/port";
import type { CliCommand } from "../command";
import { formatJson } from "../format";
import { EXIT, parseOptions, UsageError, type CliIo, type ExitCode } from "../io";
import { resolveScope, SCOPE_OPTIONS } from "../scope-options";
import { statsSummary } from "../stats-summary";
import { webUiPort } from "../service/managers";

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
    io.print(formatJson({ totals, forecast, signals, unparsedTasks: context.head.unparsedTasks, invalidJournalLines: context.head.invalidJournalLines, unknownJournalLines: context.head.unknownJournalLines }));
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
      url: await statsUrl(io, project?.id),
    }),
  );
  return EXIT.ok;
}

async function statsUrl(io: CliIo, projectId: string | undefined): Promise<string | null> {
  try {
    return `${browserOrigin(await webUiPort(io))}${statsPath(projectId)}`;
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    io.warn(error.message);
    return null;
  }
}
