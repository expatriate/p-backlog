import type { StatsReportKind } from "./stats-routes";

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

export type StatsTabKind = Exclude<StatsReportKind, "signals">;

export function statsTabSegment(tab: StatsTabKind): string | null {
  return tab === "overview" ? null : tab;
}

export function statsTabRoute(statsRoot: string, tab: StatsTabKind): string {
  const segment = statsTabSegment(tab);
  return segment === null ? statsRoot : `${statsRoot}/${segment}`;
}

export function statsTabPath(tab: StatsTabKind, projectId?: string): string {
  return statsTabRoute(statsPath(projectId), tab);
}
