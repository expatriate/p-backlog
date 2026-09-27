import { churnWindowStart } from "../../code/code-window";
import { period } from "../period";
import { reportPeriod } from "../report-periods";
import { reportBase, type ReportBase, type StatsInput } from "../scope";
import type { CodeReport, ScannedCode } from "../types";
import { statsPeriod } from "../weeks";
import { churn } from "./churn";
import { scopeLabel } from "../format";
import { density } from "./density";
import { fixRequests, type FixRequest } from "./fixes";

export type CodeInput = StatsInput & { code: ScannedCode };

export function codeReport({ code, ...input }: CodeInput, base: ReportBase = reportBase(input)): CodeReport {
  const { now, projectId } = input;
  const { openTasks } = base;
  const projects = code.projects.filter((project) => projectId === undefined || project.projectId === projectId);
  return {
    ...base.head,
    periods: { churn: reportPeriod(period(churnWindowStart(now).getTime(), now.getTime())) },
    unavailableRepos: code.unavailableRepos,
    churn: churn(openTasks, projects, scopeLabel(projectId)),
    density: density(openTasks, projects, projectId),
  };
}

export function codeFixRequests(input: StatsInput, base: ReportBase = reportBase(input)): FixRequest[] {
  return fixRequests(base.histories, statsPeriod(input.now));
}
