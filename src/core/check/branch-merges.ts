import { runGit, type GitRunner } from "../git/run";
import type { Task } from "../model/types";
import { remembered } from "../remembered";
import { commitsAfter, judgedByCommits, reviewMark, touches, type KnownMerges } from "./candidates";
import { sourcePath } from "./source-lines";
import type { Commit, RepoFacts } from "./repo-facts";

const MERGE_PARENTS = 2;

export type MergeCheck = { repo: string; tasks: readonly Task[]; facts: RepoFacts; origins: ReadonlyMap<string, string>; git?: GitRunner };

type MergeQuestion = { taskId: string; merge: Commit; origin: string; path: string };

export async function mergesKnownAtCreation({ repo, tasks, facts, origins, git = runGit }: MergeCheck): Promise<KnownMerges> {
  const questions = tasks.flatMap((task): MergeQuestion[] => {
    const origin = origins.get(task.id);
    if (origin === undefined || task.verified !== undefined || task.source === undefined || !judgedByCommits(task, facts)) return [];
    const path = sourcePath(task.source);
    return commitsAfter(facts.commits, reviewMark(task))
      .filter((commit) => commit.parents.length === MERGE_PARENTS && touches(commit, path))
      .map((merge) => ({ taskId: task.id, merge, origin, path }));
  });
  const answers = new Map<string, Promise<boolean>>();
  const bringsNothingNew = ({ merge, origin, path }: MergeQuestion) =>
    remembered(answers, `${merge.sha} ${origin} ${path}`, async () => {
      const branchCommits = await git(repo, ["rev-list", `${merge.sha}^2`, `^${merge.sha}^1`, `^${origin}`, "--", `:(literal)${path}`]);
      return branchCommits?.trim() === "";
    });
  const alreadyKnown = (await Promise.all(questions.map(async (question) => ((await bringsNothingNew(question)) ? [question] : [])))).flat();
  const known = new Map<string, Set<string>>();
  for (const { taskId, merge } of alreadyKnown) known.set(taskId, (known.get(taskId) ?? new Set()).add(merge.sha));
  return known;
}
