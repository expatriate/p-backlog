import { reportBase, type ReportBase, type StatsInput } from "../scope";
import type { CodeReport, CollectedCode } from "../types";
import { periodStart } from "../weeks";
import { churn } from "./churn";
import { density } from "./density";
import { fixBreakdown, fixRequests, type FixRequest } from "./fixes";

export type CodeInput = StatsInput & { code: CollectedCode };

export function codeReport({ code, ...input }: CodeInput, base: ReportBase = reportBase(input)): CodeReport {
  const { now, projectId } = input;
  const { histories, openTasks } = base;
  const projects = code.projects.filter((project) => projectId === undefined || project.projectId === projectId);
  return {
    ...base.head,
    unavailableRepos: code.unavailableRepos,
    churn: churn(openTasks, projects, projectId === undefined),
    density: density(openTasks, projects, projectId),
    fixes: fixBreakdown(histories, periodStart(now), now.getTime(), code.fixCommits),
  };
}

export function codeFixRequests(input: StatsInput, base: ReportBase = reportBase(input)): FixRequest[] {
  return fixRequests(base.histories, periodStart(input.now), input.now.getTime());
}
