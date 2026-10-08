import { CHURN_DAYS } from "../../code/code-window";
import { lastDays } from "../report-periods";
import { inProjectScope, type ReportContext } from "../scope";
import type { ScannedCode } from "../../code/types";
import type { CodeReport } from "../types";
import { churn } from "./churn";
import { scopeLabel } from "../format";
import { density } from "./density";

export function codeReport(context: ReportContext, code: ScannedCode): CodeReport {
  const {
    input: { now, projectId },
    openTasks,
  } = context;
  const projects = inProjectScope(code.projects, projectId, (project) => project.projectId);
  return {
    ...context.head,
    periods: { churn: lastDays(now, CHURN_DAYS) },
    unavailableRepos: code.unavailableRepos,
    churn: churn(openTasks, projects, scopeLabel(projectId)),
    density: density(openTasks, projects, projectId),
  };
}
