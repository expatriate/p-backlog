import { isClosed } from "../../model/graph";
import { statsScope, type StatsInput } from "../scope";
import type { QualityReport } from "../types";
import { periodStart } from "../weeks";
import { accuracy } from "./accuracy";
import { categoryBreakdown } from "./categories";
import { branchBreakdown, foundBreakdown } from "./origin";

export function qualityReport(input: StatsInput): QualityReport {
  const { now, projectId } = input;
  const scope = statsScope(input);
  const histories = scope.histories.filter((history) => history.type === "task");
  const openTasks = scope.tasks.filter((task) => task.type === "task" && !isClosed(task.status));
  const from = periodStart(now);
  const to = now.getTime();
  return {
    taskCount: histories.length,
    journalSince: scope.journalSince,
    invalidJournalLines: scope.invalidJournalLines,
    accuracy: accuracy(histories, from, to),
    categories: categoryBreakdown(openTasks, histories, from, to),
    found: foundBreakdown(histories, from, to),
    branches: branchBreakdown(histories, from, to, projectId === undefined),
  };
}
