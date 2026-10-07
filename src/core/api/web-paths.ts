const PROJECT = "/p";
const TASK = "/t";
const STATS = "/stats";

export const ROUTE_PATTERNS = {
  task: `${TASK}/:taskId`,
  projectList: `${PROJECT}/:projectId`,
  projectTask: `${PROJECT}/:projectId${TASK}/:taskId`,
  stats: STATS,
  projectStats: `${PROJECT}/:projectId${STATS}`,
} as const;

export function listPath(projectId?: string): string {
  return projectId === undefined ? "/" : projectPrefix(projectId);
}

export function taskPath(projectId: string | undefined, taskId: string): string {
  return `${projectPrefix(projectId)}${TASK}/${taskId}`;
}

export function statsPath(projectId?: string): string {
  return projectPrefix(projectId) + STATS;
}

function projectPrefix(projectId: string | undefined): string {
  return projectId === undefined ? "" : `${PROJECT}/${projectId}`;
}

export function statsTabPath(segment: string, projectId?: string): string {
  return segment === "" ? statsPath(projectId) : `${statsPath(projectId)}/${segment}`;
}
