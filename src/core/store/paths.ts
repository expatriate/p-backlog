import { join } from "node:path";

export const PROJECT_FILE = "project.md";

export function expandHome(path: string, home: string): string {
  if (path === "~") return home;
  return path.startsWith("~/") ? join(home, path.slice(2)) : path;
}

export function resolveBacklogRoot(env: Record<string, string | undefined>, home: string): string {
  const configured = env.BACKLOG_DIR;
  return configured ? expandHome(configured, home) : join(home, "backlog");
}

export function taskFileName(id: string): string {
  return `${id}.md`;
}
