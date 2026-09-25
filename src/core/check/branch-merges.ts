import { runGit, type GitRunner } from "../git/run";
import type { Task } from "../model/types";
import { commitsAfter, reviewMark, touches, type KnownMerges } from "./candidates";
import { sourcePath } from "./source-lines";
import type { Commit, RepoFacts } from "./repo-facts";

const MERGE_PARENTS = 2;

export async function mergesKnownAtCreation(repo: string, tasks: readonly Task[], facts: RepoFacts, origins: ReadonlyMap<string, string>, git: GitRunner = runGit): Promise<KnownMerges> {
  const known = new Map<string, Set<string>>();
  for (const task of tasks) {
    const origin = origins.get(task.id);
    if (origin === undefined || task.verified !== undefined || task.source === undefined) continue;
    const path = sourcePath(task.source);
    const merges = commitsAfter(facts.commits, reviewMark(task)).filter((commit) => commit.parents.length === MERGE_PARENTS && touches(commit, path));
    for (const merge of merges) {
      if (await bringsNothingNew(repo, merge, origin, path, git)) known.set(task.id, (known.get(task.id) ?? new Set()).add(merge.sha));
    }
  }
  return known;
}

async function bringsNothingNew(repo: string, merge: Commit, origin: string, path: string, git: GitRunner): Promise<boolean> {
  const branchCommits = await git(repo, ["rev-list", `${merge.sha}^2`, `^${merge.sha}^1`, `^${origin}`, "--", `:(literal)${path}`]);
  return branchCommits?.trim() === "";
}
