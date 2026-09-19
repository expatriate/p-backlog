import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type { Project } from "../model/types";
import { expandHome } from "../store/paths";
import { anchorOf } from "./anchor";
import { sourcePath } from "./candidates";

export async function sourceAnchor(project: Project, source: string, home: string): Promise<string | undefined> {
  const repo = await findRepo(project, home);
  if (repo === undefined) return undefined;
  const text = await readFile(join(repo, sourcePath(source)), "utf8").catch(() => null);
  return text === null ? undefined : (anchorOf(text, source) ?? undefined);
}

export async function findRepo(project: Project, home: string): Promise<string | undefined> {
  for (const repo of project.repos.map((path) => expandHome(path, home))) {
    if (await access(repo).then(() => true, () => false)) return repo;
  }
  return undefined;
}

const runFile = promisify(execFile);

export async function hasCommit(repo: string, sha: string): Promise<boolean> {
  return runFile("git", ["-C", repo, "--no-optional-locks", "cat-file", "-e", `${sha}^{commit}`]).then(
    () => true,
    () => false,
  );
}
