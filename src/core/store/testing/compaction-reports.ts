import { effectReport } from "../../stats/effect/effect-report";
import { flowForecast } from "../../stats/flow/forecast";
import { qualityReport } from "../../stats/quality/quality-report";
import { statsReport } from "../../stats/report";
import { reportBase, type StatsInput } from "../../stats/scope";
import { statsSignals } from "../../stats/signals/signals";
import type { CollectedCode } from "../../code/types";
import { readJournals } from "../journal";
import { loadBacklog, unparsedTasks } from "../load";

const FILE_COUNTERS = { taskCount: 0, invalidJournalLines: 0, unknownJournalLines: 0 };

export async function reportsOf(root: string, projectIds: readonly string[], now: Date, code: CollectedCode) {
  const { tasks, errors } = await loadBacklog(root);
  const journals = await readJournals(root, projectIds);
  return [undefined, ...projectIds].map((projectId) => {
    const input: StatsInput = { tasks, journals, now, projectId, unparsedTasks: unparsedTasks(errors) };
    const base = reportBase(input);
    const stats = statsReport(input, base);
    return {
      stats: { ...stats, ...FILE_COUNTERS },
      forecast: flowForecast(base.histories, stats.totals.open, now),
      quality: { ...qualityReport(input, base, []), ...FILE_COUNTERS },
      signals: statsSignals(input, base),
      effect: { ...effectReport({ ...input, code }, base), ...FILE_COUNTERS },
    };
  });
}
