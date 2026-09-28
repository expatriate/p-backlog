const PROJECT_ROUTE = "/p/:projectId";
const TASK_ROUTE = "/t/:taskId";
const STATS_ROUTE = "/stats";

export const ROUTE_PATTERNS = {
  task: TASK_ROUTE,
  projectList: PROJECT_ROUTE,
  projectTask: `${PROJECT_ROUTE}${TASK_ROUTE}`,
  stats: STATS_ROUTE,
  projectStats: `${PROJECT_ROUTE}${STATS_ROUTE}`,
} as const;

export function listPath(projectId?: string): string {
  return projectId === undefined ? "/" : projectPrefix(projectId);
}

export function taskPath(projectId: string | undefined, taskId: string): string {
  return projectPrefix(projectId) + withTrailingParam(TASK_ROUTE, taskId);
}

export function statsPath(projectId?: string): string {
  return projectPrefix(projectId) + STATS_ROUTE;
}

function projectPrefix(projectId: string | undefined): string {
  return projectId === undefined ? "" : withTrailingParam(PROJECT_ROUTE, projectId);
}

function withTrailingParam(route: string, value: string): string {
  return route.replace(/:\w+$/, () => value);
}

export function statsTabPath(segment: string, projectId?: string): string {
  return segment === "" ? statsPath(projectId) : `${statsPath(projectId)}/${segment}`;
}
