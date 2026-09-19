import { reportBase, type ReportBase, type StatsInput } from "../scope";
import type { QualityReport } from "../types";
import { periodStart } from "../weeks";
import { accuracy } from "./accuracy";
import { categoryBreakdown } from "./categories";
import { branchBreakdown, foundBreakdown } from "./origin";

export function qualityReport(input: StatsInput, base: ReportBase = reportBase(input)): QualityReport {
  const { now, projectId } = input;
  const { histories, openTasks } = base;
  const from = periodStart(now);
  const to = now.getTime();
  return {
    ...base.head,
    accuracy: accuracy(histories, from, to),
    categories: categoryBreakdown(openTasks, histories, from, to),
    found: foundBreakdown(histories, from, to),
    branches: branchBreakdown(histories, from, to, projectId === undefined),
  };
}
