import { join } from "node:path";
import type { PathErrorHandler } from "../errors";
import { runGit } from "../git/run";
import type { Project, Task } from "../model/types";
import { fileExists, readReportingFailure, readTextIfFile } from "../store/fs-utils";
import { expandHome } from "../store/paths";
import { findGitRoots, realpathOrNull, type GitRoots } from "../store/resolve-project";
import { anchorOf } from "./anchor";
import { sourcePath } from "../model/source";
import { currentSourceIn } from "./current-source";

export type SourceAnchor = { kind: "no-file" } | { kind: "uncomputable" } | { kind: "anchor"; anchor: string };

export type RepoLookup = { home: string; onUnreadable: PathErrorHandler; workingDir?: string | undefined };

export async function sourceAnchor(repo: string | undefined, source: string, onUnreadable: PathErrorHandler): Promise<SourceAnchor> {
  const text = repo === undefined ? null : await readReportingFailure(join(repo, sourcePath(source)), readTextIfFile, onUnreadable);
  if (text === null) return { kind: "no-file" };
  const anchor = anchorOf(text, source);
  return anchor === null ? { kind: "uncomputable" } : { kind: "anchor", anchor };
}

export async function relocatedSource(repo: string | undefined, task: Task): Promise<string | undefined> {
  const current = repo === undefined ? null : await currentSourceIn(repo, task);
  return current === null || current === task.source ? undefined : current;
}

export type ProjectCheckout = { path: string; linkedWorktree: boolean };

export async function findRepo(project: Project, { workingDir, ...lookup }: RepoLookup): Promise<string | undefined> {
  return (await projectCheckout(project, workingDir === undefined ? null : findGitRoots(workingDir), lookup))?.path;
}

export async function projectCheckout(project: Project, workingRoots: GitRoots | null, lookup: Omit<RepoLookup, "workingDir">): Promise<ProjectCheckout | undefined> {
  const repo = await firstExistingRepo(project, lookup);
  if (repo === undefined) return undefined;
  if (workingRoots === null || workingRoots.main !== realpathOrNull(repo)) return { path: repo, linkedWorktree: false };
  return { path: workingRoots.worktree, linkedWorktree: workingRoots.worktree !== workingRoots.main };
}

async function firstExistingRepo(project: Project, { home, onUnreadable }: Omit<RepoLookup, "workingDir">): Promise<string | undefined> {
  for (const repo of project.repos.map((path) => expandHome(path, home))) {
    if ((await readReportingFailure(repo, fileExists, onUnreadable)) === true) return repo;
  }
  return undefined;
}

export async function hasCommit(repo: string, sha: string): Promise<boolean> {
  return (await runGit(repo, ["cat-file", "-e", `${sha}^{commit}`])) !== null;
}
