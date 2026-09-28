import { grainPeriods } from "../report-periods";
import type { ReportContext } from "../scope";
import type { ProjectGraphRow, QualityReport } from "../types";
import { statsPeriod } from "../weeks";
import { accuracy, accuracyDays, accuracyWeeks, matchAccuracy, methodAccuracy } from "./accuracy";
import { categoryBreakdown } from "./categories";
import { graphFilterEffect } from "./graph-filter";
import { branchBreakdown, foundBreakdown } from "./origin";
import { scopeLabel } from "../format";

export function qualityReport(context: ReportContext, graphs: ProjectGraphRow[]): QualityReport {
  const { input: { now, projectId }, histories, openTasks } = context;
  const period = statsPeriod(now);
  return {
    ...context.head,
    periods: grainPeriods(now),
    accuracy: accuracy(histories, period),
    accuracyWeeks: accuracyWeeks(histories, now),
    accuracyDays: accuracyDays(histories, now),
    methodAccuracy: methodAccuracy(histories, period),
    matchAccuracy: matchAccuracy(histories, period),
    graph: { projects: graphs, filter: graphFilterEffect(histories, period) },
    categories: categoryBreakdown(openTasks, histories, period),
    found: foundBreakdown(histories, period),
    branches: branchBreakdown(histories, period, scopeLabel(projectId)),
  };
}
