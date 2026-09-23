import { reportBase, type ReportBase, type StatsInput } from "../scope";
import type { QualityReport } from "../types";
import { statsPeriod } from "../weeks";
import { accuracy, accuracyWeeks, symbolAccuracy } from "./accuracy";
import { categoryBreakdown } from "./categories";
import { branchBreakdown, foundBreakdown } from "./origin";

export function qualityReport(input: StatsInput, base: ReportBase = reportBase(input)): QualityReport {
  const { now, projectId } = input;
  const { histories, openTasks } = base;
  const period = statsPeriod(now);
  return {
    ...base.head,
    accuracy: accuracy(histories, period),
    accuracyWeeks: accuracyWeeks(histories, now),
    symbolAccuracy: symbolAccuracy(histories, period),
    categories: categoryBreakdown(openTasks, histories, period),
    found: foundBreakdown(histories, period),
    branches: branchBreakdown(histories, period, projectId === undefined),
  };
}
