import { parseArgs } from "node:util";
import { flowReport } from "../../core/stats/flow/flow-report";
import { statsReport } from "../../core/stats/report";
import { statsSignals } from "../../core/stats/signals/signals";
import { readJournals } from "../../core/store/journal";
import { loadBacklog } from "../../core/store/load";
import { DEFAULT_PORT } from "../../server/port";
import { EXIT, UsageError, withUsageErrors, type CliIo } from "../io";
import { requireProject } from "../lookups";
import { statsSummary } from "../stats-summary";

export async function runStats(args: string[], io: CliIo): Promise<number> {
  const { values, positionals } = withUsageErrors(() =>
    parseArgs({
      args,
      allowPositionals: true,
      options: { project: { type: "string" }, "all-projects": { type: "boolean", default: false }, json: { type: "boolean", default: false } },
    }),
  );
  if (positionals.length > 0) throw new UsageError(`Лишние аргументы: ${positionals.join(" ")}`);
  if (values.project !== undefined && values["all-projects"]) throw new UsageError("Укажите либо --project, либо --all-projects");

  const loaded = await loadBacklog(io.backlogRoot);
  const project = values["all-projects"] ? undefined : requireProject(loaded, io, values.project);
  if (!values["all-projects"] && project === undefined) return EXIT.notFound;

  const journals = await readJournals(io.backlogRoot, loaded.projects.map((candidate) => candidate.id));
  const input = { tasks: loaded.tasks, journals, now: io.now(), projectId: project?.id };
  const totals = statsReport(input).totals;
  const forecast = flowReport(input).forecast;
  const signals = statsSignals(input);

  if (values.json) {
    io.print(JSON.stringify({ totals, forecast, signals }, null, 2));
    return EXIT.ok;
  }
  const path = project === undefined ? "/stats" : `/p/${project.id}/stats`;
  io.print(statsSummary({ scopeName: project?.name ?? "Все проекты", totals, forecast, signals, url: `http://localhost:${DEFAULT_PORT}${path}` }));
  return EXIT.ok;
}
