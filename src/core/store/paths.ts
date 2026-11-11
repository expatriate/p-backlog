import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { Project } from "../model/types";

export const PROJECT_FILE = "project.md";
export const PID_FILE_ENV = "P_BACKLOG_PID_FILE";
const HOME_PREFIX = /^~[\\/]/;

export function expandHome(path: string, home: string): string {
  if (path === "~") return home;
  return HOME_PREFIX.test(path) ? join(home, path.slice(2)) : path;
}

export function resolveBacklogRoot(env: Record<string, string | undefined>, home: string): string {
  const configured = env.BACKLOG_DIR;
  return configured ? resolve(expandHome(configured, home)) : join(home, "backlog");
}

export function taskFileName(id: string): string {
  return `${id}.md`;
}

export function projectDirOf(project: Pick<Project, "path">): string {
  return dirname(project.path);
}

export function relativeInside(container: string, path: string): string | null {
  const inside = relative(container, path);
  const outside = isAbsolute(inside) || inside === ".." || inside.startsWith(`..${sep}`);
  return outside ? null : inside.split(sep).join("/");
}
