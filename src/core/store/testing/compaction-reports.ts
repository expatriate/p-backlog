import { effectReport } from "../../stats/effect/effect-report";
import { flowForecast } from "../../stats/flow/forecast";
import { qualityReport } from "../../stats/quality/quality-report";
import { statsReport } from "../../stats/report";
import { reportContext, type StatsInput } from "../../stats/scope";
import { statsSignals } from "../../stats/signals/signals";
import type { CollectedCode } from "../../code/types";
import { readJournals } from "../journal";
import { loadBacklog, unparsedTasks } from "../load";

const FILE_COUNTERS = { taskCount: 0, invalidJournalLines: 0, unknownJournalLines: 0 };

export async function reportsOf(root: string, projectIds: readonly string[], now: Date, code: CollectedCode) {
  const { tasks, errors } = await loadBacklog(root);
  const journals = await readJournals(root, projectIds);
  const whole: StatsInput = { tasks, journals, now, unparsedTasks: unparsedTasks(errors) };
  const wholeBacklog = reportContext(whole);
  return [undefined, ...projectIds].map((projectId) => {
    const context = reportContext({ ...whole, projectId });
    const stats = statsReport(context);
    return {
      stats: { ...stats, ...FILE_COUNTERS },
      forecast: flowForecast(context.histories, stats.totals.open, now),
      quality: { ...qualityReport(context, []), ...FILE_COUNTERS },
      signals: statsSignals(context),
      effect: { ...effectReport(context, code, wholeBacklog), ...FILE_COUNTERS },
    };
  });
}
