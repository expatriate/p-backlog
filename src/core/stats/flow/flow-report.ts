import { isClosed } from "../../model/graph";
import { statsScope, type StatsInput } from "../scope";
import type { FlowReport } from "../types";
import { periodStart } from "../weeks";
import { flowNow } from "./current";
import { flowCycle } from "./cycle";
import { flowEpics } from "./epics";
import { flowForecast } from "./forecast";
import { flowWip } from "./wip";

export function flowReport(input: StatsInput): FlowReport {
  const { now } = input;
  const scope = statsScope(input);
  const histories = scope.histories.filter((history) => history.type === "task");
  const tasks = scope.tasks.filter((task) => task.type === "task");
  return {
    taskCount: histories.length,
    journalSince: scope.journalSince,
    invalidJournalLines: scope.invalidJournalLines,
    now: flowNow(tasks, histories, now),
    cycle: flowCycle(histories, periodStart(now), now.getTime()),
    wip: flowWip(histories, now, scope.journalStart),
    forecast: flowForecast(histories, tasks.filter((task) => !isClosed(task.status)).length, now),
    epics: flowEpics(scope.tasks, scope.histories, now),
  };
}
