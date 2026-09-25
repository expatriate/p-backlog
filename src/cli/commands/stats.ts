import { flowForecast } from "../../core/stats/flow/forecast";
import { reportBase } from "../../core/stats/scope";
import { statsReport } from "../../core/stats/report";
import { statsSignals } from "../../core/stats/signals/signals";
import { readJournals } from "../../core/store/journal";
import { loadBacklog, unparsedTasks } from "../../core/store/load";
import type { CliCommand } from "../command";
import { EXIT, parseOptions, type CliIo } from "../io";
import { cliMessages } from "../messages";
import { resolveScope, SCOPE_OPTIONS } from "../scope-options";
import { statsSummary } from "../stats-summary";
import { webPort } from "../service/managers";

export const statsCommand: CliCommand = {
  name: "stats",
  usage: () => ["[--project id | --all-projects] [--json]"],
  run: runStats,
};

async function runStats(args: string[], io: CliIo): Promise<number> {
  const values = parseOptions(io.language, args, { ...SCOPE_OPTIONS, json: { type: "boolean", default: false } });

  const loaded = await loadBacklog(io.backlogRoot);
  const scope = resolveScope(loaded, io, values);
  if (scope === null) return EXIT.notFound;
  const { project } = scope;

  const journals = await readJournals(io.backlogRoot, scope.activeIds);
  const inScope = new Set(scope.activeIds);
  const scoped = (task: { projectId: string }) => inScope.has(task.projectId);
  const input = { tasks: loaded.tasks.filter(scoped), journals, now: io.now(), projectId: project?.id, unparsedTasks: unparsedTasks(loaded.errors).filter(scoped) };
  const base = reportBase(input);
  const { totals } = statsReport(input, base);
  const forecast = flowForecast(base.histories, totals.open, io.now());
  const signals = statsSignals(input, base);

  if (values.json) {
    io.print(JSON.stringify({ totals, forecast, signals, unparsedTasks: base.head.unparsedTasks, invalidJournalLines: base.head.invalidJournalLines }, null, 2));
    return EXIT.ok;
  }
  const path = project === undefined ? "/stats" : `/p/${project.id}/stats`;
  io.print(
    statsSummary({
      language: io.language,
      scopeName: project?.name ?? cliMessages(io.language).projectsFallbackName,
      head: base.head,
      totals,
      forecast,
      signals,
      url: `http://localhost:${await webPort(io)}${path}`,
    }),
  );
  return EXIT.ok;
}
