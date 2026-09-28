import type { Project, Task } from "../../core/model/types";
import type { AppMessages } from "./messages.ru";

export type TaskScope = (task: Task) => boolean;

export function taskScope(projects: readonly Project[] | undefined, projectId: string | undefined): TaskScope | undefined {
  if (projects === undefined) return undefined;
  if (projectId !== undefined) return (task) => task.projectId === projectId;
  const activeIds = activeProjectIds(projects);
  return (task) => activeIds.has(task.projectId);
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
