import { literalPathspecs, outputLines, runGit, type GitRunner } from "../git/run";
import type { TaskOrigin } from "../journal/events";
import type { Task } from "../model/types";
import { remembered } from "../remembered";
import { judgedByCommits, type AnchorStates, type KnownCommits } from "./candidates";
import { reviewMark } from "./reviewed-task";
import { commitsTouchingSince } from "./source-commits";
import { commitsCarryingContent } from "./landed-content";
import { sourcePath } from "../model/source";
import { FACTS_HISTORY_OPTIONS, type Commit, type RepoFacts } from "./repo-facts";

const MERGE_PARENTS = 2;

export type KnownCommitsQuestion = { repo: string; tasks: readonly Task[]; facts: RepoFacts; anchors: AnchorStates; origins: ReadonlyMap<string, TaskOrigin>; git?: GitRunner };

type CreationQuestion = { taskId: string; creation: string; path: string; changes: Commit[] };

type CreationCopies = {
  broughtByMerge: (merge: Commit, creation: string, path: string) => Promise<string[] | null>;
  copiesOf: (creation: string, path: string) => Promise<ReadonlySet<string>>;
};

export async function commitsKnownAtCreation({ repo, tasks, facts, anchors, origins, git = runGit }: KnownCommitsQuestion): Promise<KnownCommits> {
  const questions = tasks.flatMap((task): CreationQuestion[] => {
    const origin = origins.get(task.id);
    if (origin === undefined || task.verified !== undefined || task.source === undefined || !judgedByCommits(task, anchors)) return [];
    const path = sourcePath(task.source);
    return [{ taskId: task.id, creation: origin.commit, path, changes: commitsTouchingSince(facts.commits, path, reviewMark(task)) }];
  });
  const copies = creationCopies(repo, git);
  const answers = await Promise.all(
    questions.map(async ({ taskId, creation, path, changes }) => {
      const known = await Promise.all(changes.map(async (commit) => ((await isKnownAtCreation(copies, commit, creation, path)) ? [commit.sha] : [])));
      return { taskId, known: known.flat() };
    }),
  );
  return new Map(answers.filter(({ known }) => known.length > 0).map(({ taskId, known }) => [taskId, new Set(known)]));
}

function creationCopies(repo: string, git: GitRunner): CreationCopies {
  const carryingContent = commitsCarryingContent(repo, git, FACTS_HISTORY_OPTIONS);
  const branchCommitsByMerge = new Map<string, Promise<string[] | null>>();
  const copiesByCreation = new Map<string, Promise<ReadonlySet<string>>>();
  return {
    broughtByMerge: (merge, creation, path) =>
      remembered(branchCommitsByMerge, `${merge.sha} ${creation} ${path}`, async () =>
        outputLines(await git(repo, ["rev-list", `${merge.sha}^2`, `^${merge.sha}^1`, `^${creation}`, "--", ...literalPathspecs([path])])),
      ),
    copiesOf: (creation, path) => remembered(copiesByCreation, `${creation} ${path}`, async () => new Set(await carryingContent(creation, literalPathspecs([path])))),
  };
}

async function isKnownAtCreation(copies: CreationCopies, commit: Commit, creation: string, path: string): Promise<boolean> {
  if (commit.parents.length !== MERGE_PARENTS) return (await copies.copiesOf(creation, path)).has(commit.sha);
  const brought = await copies.broughtByMerge(commit, creation, path);
  if (brought === null) return false;
  if (brought.length === 0) return true;
  const copied = await copies.copiesOf(creation, path);
  return brought.every((sha) => copied.has(sha));
}
