import { parseArgs } from "node:util";
import { flowForecast } from "../../core/stats/flow/forecast";
import { reportBase } from "../../core/stats/scope";
import { statsReport } from "../../core/stats/report";
import { statsSignals } from "../../core/stats/signals/signals";
import { readJournals } from "../../core/store/journal";
import { loadBacklog } from "../../core/store/load";
import { readPort } from "../../server/port";
import { EXIT, UsageError, withUsageErrors, type CliIo } from "../io";
import { resolveScope, SCOPE_OPTIONS } from "../scope-options";
import { statsSummary } from "../stats-summary";

export async function runStats(args: string[], io: CliIo): Promise<number> {
  const { values, positionals } = withUsageErrors(() =>
    parseArgs({
      args,
      allowPositionals: true,
      options: { ...SCOPE_OPTIONS, json: { type: "boolean", default: false } },
    }),
  );
  if (positionals.length > 0) throw new UsageError(`Лишние аргументы: ${positionals.join(" ")}`);

  const loaded = await loadBacklog(io.backlogRoot);
  const scope = resolveScope(loaded, io, values);
  if (scope === null) return EXIT.notFound;
  const { project } = scope;

  const journals = await readJournals(io.backlogRoot, loaded.projects.map((candidate) => candidate.id));
  const input = { tasks: loaded.tasks, journals, now: io.now(), projectId: project?.id };
  const base = reportBase(input);
  const totals = statsReport(input, base).totals;
  const forecast = flowForecast(base.histories, base.openTasks.length, io.now());
  const signals = statsSignals(input);

  if (values.json) {
    io.print(JSON.stringify({ totals, forecast, signals }, null, 2));
    return EXIT.ok;
  }
  const path = project === undefined ? "/stats" : `/p/${project.id}/stats`;
  io.print(statsSummary({ scopeName: project?.name ?? "Все проекты", totals, forecast, signals, url: `http://localhost:${readPort(io.env.PORT)}${path}` }));
  return EXIT.ok;
}
