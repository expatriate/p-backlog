import { isClosed } from "../../model/graph";
import { statsScope, type StatsInput } from "../scope";
import type { CodeReport, CollectedCode } from "../types";
import { periodStart } from "../weeks";
import { churn } from "./churn";
import { density } from "./density";
import { fixBreakdown, fixRequests, type FixRequest } from "./fixes";

export type CodeInput = StatsInput & { code: CollectedCode };

export function codeReport({ code, ...input }: CodeInput): CodeReport {
  const { now, projectId } = input;
  const scope = statsScope(input);
  const histories = scope.histories.filter((history) => history.type === "task");
  const openTasks = scope.tasks.filter((task) => task.type === "task" && !isClosed(task.status));
  const projects = code.projects.filter((project) => projectId === undefined || project.projectId === projectId);
  return {
    taskCount: histories.length,
    journalSince: scope.journalSince,
    invalidJournalLines: scope.invalidJournalLines,
    unavailableRepos: code.unavailableRepos,
    churn: churn(openTasks, projects, projectId === undefined),
    density: density(openTasks, projects, projectId),
    fixes: fixBreakdown(histories, periodStart(now), now.getTime(), code.fixCommits),
  };
}

export function codeFixRequests(input: StatsInput): FixRequest[] {
  const histories = statsScope(input).histories.filter((history) => history.type === "task");
  return fixRequests(histories, periodStart(input.now), input.now.getTime());
}
