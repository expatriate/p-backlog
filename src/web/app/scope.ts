import type { Project, Task } from "../../core/model/types";
import type { AppMessages } from "./messages.ru";

export function activeProjectIds(projects: readonly Project[]): Set<string> {
  return new Set(projects.filter((project) => project.active).map((project) => project.id));
}

export function tasksInScope(tasks: readonly Task[], projectId: string | undefined, activeIds: ReadonlySet<string>): Task[] {
  return tasks.filter((task) => (projectId === undefined ? activeIds.has(task.projectId) : task.projectId === projectId));
}

export function projectNameOf(projects: readonly Project[] | undefined, projectId: string): string {
  return projects?.find((project) => project.id === projectId)?.name ?? projectId;
}

export function scopeNote(projects: readonly Project[], messages: AppMessages): string {
  return messages.scopeNote(activeProjectIds(projects).size, projects.length);
}
