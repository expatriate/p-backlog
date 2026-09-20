import type { Task } from "../../model/types";
import { folderOf } from "../breakdowns";
import { countBy } from "../numbers";
import { PRIORITY_WEIGHT } from "../weights";
import type { ChurnRow, ProjectCode } from "../types";

const CHURN_LIMIT = 8;

export function churn(openTasks: readonly Task[], projects: readonly ProjectCode[], withProject: boolean): ChurnRow[] {
  return projects
    .flatMap((project) => {
      const commits = folderCommits(project);
      const debt = folderDebt(openTasks.filter((task) => task.projectId === project.projectId));
      return [...debt.entries()].map(([folder, { tasks, weight }]) => {
        const folderChanges = commits.get(folder) ?? 0;
        return { label: withProject ? `${project.projectId} · ${folder}` : folder, commits: folderChanges, tasks, weight, score: folderChanges * weight };
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

function folderDebt(tasks: readonly Task[]): Map<string, { tasks: number; weight: number }> {
  const debt = new Map<string, { tasks: number; weight: number }>();
  for (const task of tasks) {
    if (task.source === undefined) continue;
    const folder = folderOf(task.source);
    const current = debt.get(folder) ?? { tasks: 0, weight: 0 };
    debt.set(folder, { tasks: current.tasks + 1, weight: current.weight + PRIORITY_WEIGHT[task.priority] });
  }
  return debt;
}
