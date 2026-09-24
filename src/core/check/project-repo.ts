import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { runGit } from "../git/run";
import type { Project, Task } from "../model/types";
import { expandHome } from "../store/paths";
import { checkoutOf } from "../store/resolve-project";
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

export async function findRepo(project: Project, home: string, workingDir?: string): Promise<string | undefined> {
  const repo = await firstExistingRepo(project, home);
  if (repo === undefined || workingDir === undefined) return repo;
  return checkoutOf(repo, workingDir) ?? repo;
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
