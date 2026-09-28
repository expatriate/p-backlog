import { CHURN_DAYS } from "../../code/code-window";
import { lastDays } from "../report-periods";
import { reportBase, type ReportBase, type StatsInput } from "../scope";
import type { ScannedCode } from "../../code/types";
import type { CodeReport } from "../types";
import { churn } from "./churn";
import { scopeLabel } from "../format";
import { density } from "./density";

export type CodeInput = StatsInput & { code: ScannedCode };

export function codeReport({ code, ...input }: CodeInput, base: ReportBase = reportBase(input)): CodeReport {
  const { now, projectId } = input;
  const { openTasks } = base;
  const projects = code.projects.filter((project) => projectId === undefined || project.projectId === projectId);
  return {
    ...base.head,
    periods: { churn: lastDays(now, CHURN_DAYS) },
    unavailableRepos: code.unavailableRepos,
    churn: churn(openTasks, projects, scopeLabel(projectId)),
    density: density(openTasks, projects, projectId),
  };
}
