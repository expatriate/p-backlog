import { isClosed } from "../../core/model/graph";
import type { Project, Task } from "../../core/model/types";
import type { AppMessages } from "./messages.ru";

export type TaskScope = (task: Task) => boolean;

export function taskScope(projects: readonly Project[] | undefined, projectId: string | undefined): TaskScope | undefined {
  if (projects === undefined) return undefined;
  if (projectId !== undefined) return (task) => task.projectId === projectId;
  const activeIds = activeProjectIds(projects);
  return (task) => activeIds.has(task.projectId);
}

export function isOpenTask(task: Task): boolean {
  return !isClosed(task.status);
}

type OpenTaskCounts = { inScope: number; outOfScope: number };

export function countOpenTasks(tasks: readonly Task[], isInScope: TaskScope): OpenTaskCounts {
  const counts: OpenTaskCounts = { inScope: 0, outOfScope: 0 };
  for (const task of tasks) {
    if (!isOpenTask(task)) continue;
    if (isInScope(task)) counts.inScope += 1;
    else counts.outOfScope += 1;
  }
  return counts;
}

export function projectNameOf(projects: readonly Project[] | undefined, projectId: string): string {
  return projects?.find((project) => project.id === projectId)?.name ?? projectId;
}

export function scopeNote(projects: readonly Project[], messages: AppMessages): string {
  return messages.scopeNote(activeProjectIds(projects).size, projects.length);
}

function activeProjectIds(projects: readonly Project[]): Set<string> {
  return new Set(projects.filter((project) => project.active).map((project) => project.id));
}
