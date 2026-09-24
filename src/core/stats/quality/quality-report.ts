import { reportBase, type ReportBase, type StatsInput } from "../scope";
import type { ProjectGraphRow, QualityReport } from "../types";
import { statsPeriod } from "../weeks";
import { accuracy, accuracyWeeks, matchAccuracy, methodAccuracy } from "./accuracy";
import { categoryBreakdown } from "./categories";
import { graphFilterEffect } from "./graph-filter";
import { branchBreakdown, foundBreakdown } from "./origin";
import { scopeLabel } from "../format";

export function qualityReport(input: StatsInput, base: ReportBase = reportBase(input), graphs: ProjectGraphRow[] = []): QualityReport {
  const { now, projectId } = input;
  const { histories, openTasks } = base;
  const period = statsPeriod(now);
  return {
    ...base.head,
    accuracy: accuracy(histories, period),
    accuracyWeeks: accuracyWeeks(histories, now),
    methodAccuracy: methodAccuracy(histories, period),
    matchAccuracy: matchAccuracy(histories, period),
    graph: { projects: graphs, filter: graphFilterEffect(histories, period) },
    categories: categoryBreakdown(openTasks, histories, period),
    found: foundBreakdown(histories, period),
    branches: branchBreakdown(histories, period, scopeLabel(projectId)),
  };
}
