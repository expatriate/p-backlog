import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { isAbsolute, relative, sep } from "node:path";
import type { Project } from "../model/types";
import { expandHome } from "./paths";

export function findRepoRoot(dir: string): string {
  try {
    const topLevel = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: dir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return realpathSync(topLevel.trim());
  } catch {
    return realpathSync(dir);
  }
}

export function findProjectForDir(projects: readonly Project[], dir: string, home: string): Project | undefined {
  return findProjectForRepoRoot(projects, findRepoRoot(dir), home);
}

export function findProjectForRepoRoot(projects: readonly Project[], root: string, home: string): Project | undefined {
  const matches = projects.flatMap((project) =>
    project.repos.flatMap((repo) => {
      const repoPath = realpathOrNull(expandHome(repo, home));
      return repoPath !== null && isSameOrInside(root, repoPath) ? [{ project, repoPath }] : [];
    }),
  );
  return matches.sort((a, b) => b.repoPath.length - a.repoPath.length)[0]?.project;
}

function isSameOrInside(path: string, container: string): boolean {
  const relation = relative(container, path);
  return relation === "" || (!isAbsolute(relation) && relation.split(sep)[0] !== "..");
}

function realpathOrNull(path: string): string | null {
  try {
    return realpathSync(path);
  } catch {
    return null;
  }
}
