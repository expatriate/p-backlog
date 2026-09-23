import { reportBase, type ReportBase, type StatsInput } from "../scope";
import type { CodeReport, ScannedCode } from "../types";
import { statsPeriod } from "../weeks";
import { churn } from "./churn";
import { density } from "./density";
import { fixRequests, type FixRequest } from "./fixes";

export type CodeInput = StatsInput & { code: ScannedCode };

export function codeReport({ code, ...input }: CodeInput, base: ReportBase = reportBase(input)): CodeReport {
  const { projectId } = input;
  const { openTasks } = base;
  const projects = code.projects.filter((project) => projectId === undefined || project.projectId === projectId);
  return {
    ...base.head,
    unavailableRepos: code.unavailableRepos,
    churn: churn(openTasks, projects, projectId === undefined),
    density: density(openTasks, projects, projectId),
  };
}

export function codeFixRequests(input: StatsInput, base: ReportBase = reportBase(input)): FixRequest[] {
  return fixRequests(base.histories, statsPeriod(input.now));
}
