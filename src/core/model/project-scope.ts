import type { Project } from "./types";

export function projectsInScope(projects: readonly Project[], projectId: string | undefined, { wholeBacklog = false }: { wholeBacklog?: boolean } = {}): Project[] {
  return projects.filter((project) => project.id === projectId || ((projectId === undefined || wholeBacklog) && project.active));
}

export function activeProjects(projects: readonly Project[]): Project[] {
  return projects.filter((project) => project.active);
}
