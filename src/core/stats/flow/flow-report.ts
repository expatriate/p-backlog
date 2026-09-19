import { isClosed } from "../../model/graph";
import { reportBase, type ReportBase, type StatsInput } from "../scope";
import type { FlowReport } from "../types";
import { periodStart } from "../weeks";
import { flowNow } from "./current";
import { flowCycle } from "./cycle";
import { flowEpics } from "./epics";
import { flowForecast } from "./forecast";
import { flowWip } from "./wip";

export function flowReport(input: StatsInput, base: ReportBase = reportBase(input)): FlowReport {
  const { now } = input;
  const { scope, histories, tasks } = base;
  const flowState = flowNow(tasks, histories, now);
  return {
    ...base.head,
    now: flowState,
    cycle: flowCycle(histories, periodStart(now), now.getTime()),
    wip: { weeks: flowWip(histories, now, scope.journalStart), current: flowState.inProgress },
    forecast: flowForecast(histories, tasks.filter((task) => !isClosed(task.status)).length, now),
    epics: flowEpics(scope.tasks, scope.histories, now),
  };
}
