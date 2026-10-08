import type { Task } from "../../model/types";
import { folderOf } from "../folders";
import type { ProjectLabel } from "../format";
import { countBy, groupBy } from "../../collections";
import { sum } from "../../numbers";
import { PRIORITY_WEIGHT } from "../weights";
import type { ProjectCode } from "../../code/types";
import type { ChurnRow } from "../types";

const CHURN_LIMIT = 8;

export function churn(openTasks: readonly Task[], projects: readonly ProjectCode[], projectLabel: ProjectLabel): ChurnRow[] {
  return projects
    .flatMap((project) => {
      const commits = folderCommits(project);
      return folderDebt(openTasks.filter((task) => task.projectId === project.projectId)).map(({ folder, tasks, weight }) => {
        const folderChanges = commits.get(folder) ?? 0;
        return { label: projectLabel(project.projectId, folder), commits: folderChanges, tasks, weight, score: folderChanges * weight };
      });
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    .slice(0, CHURN_LIMIT);
}

function folderCommits(project: ProjectCode): Map<string, number> {
  const touched = project.repos.flatMap((repo) => repo.commits).flatMap((files) => [...new Set(files.map(folderOf))]);
  return countBy(touched, (folder) => folder);
}

function folderDebt(tasks: readonly Task[]): { folder: string; tasks: number; weight: number }[] {
  const sourced = tasks.flatMap((task) => (task.source === undefined ? [] : [{ folder: folderOf(task.source), weight: PRIORITY_WEIGHT[task.priority] }]));
  return [...groupBy(sourced, ({ folder }) => folder).entries()].map(([folder, own]) => ({ folder, tasks: own.length, weight: sum(own.map(({ weight }) => weight)) }));
}
