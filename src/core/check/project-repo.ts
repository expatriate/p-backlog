import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { runGit } from "../git/run";
import type { Project, Task } from "../model/types";
import { expandHome } from "../store/paths";
import { findGitRoots, realpathOrNull, type GitRoots } from "../store/resolve-project";
import { anchorOf } from "./anchor";
import { sourcePath } from "./candidates";
import { currentSourceIn } from "./current-source";

export async function sourceAnchor(project: Project, source: string, home: string, workingDir?: string): Promise<string | null | undefined> {
  const repo = await findRepo(project, home, workingDir);
  if (repo === undefined) return undefined;
  const text = await readFile(join(repo, sourcePath(source)), "utf8").catch(() => null);
  return text === null ? undefined : anchorOf(text, source);
}

export async function relocatedSource(project: Project, task: Task, home: string, workingDir?: string): Promise<string | undefined> {
  const repo = await findRepo(project, home, workingDir);
  const current = repo === undefined ? null : await currentSourceIn(repo, task);
  return current === null || current === task.source ? undefined : current;
}

export type ProjectCheckout = { path: string; linkedWorktree: boolean };

export async function findRepo(project: Project, home: string, workingDir?: string): Promise<string | undefined> {
  return (await projectCheckout(project, home, workingDir === undefined ? null : findGitRoots(workingDir)))?.path;
}

export async function projectCheckout(project: Project, home: string, workingRoots: GitRoots | null): Promise<ProjectCheckout | undefined> {
  const repo = await firstExistingRepo(project, home);
  if (repo === undefined) return undefined;
  if (workingRoots === null || workingRoots.main !== realpathOrNull(repo)) return { path: repo, linkedWorktree: false };
  return { path: workingRoots.worktree, linkedWorktree: workingRoots.worktree !== workingRoots.main };
}

async function firstExistingRepo(project: Project, home: string): Promise<string | undefined> {
  for (const repo of project.repos.map((path) => expandHome(path, home))) {
    if (await access(repo).then(() => true, () => false)) return repo;
  }
  return undefined;
}

export async function hasCommit(repo: string, sha: string): Promise<boolean> {
  return (await runGit(repo, ["cat-file", "-e", `${sha}^{commit}`])) !== null;
}
