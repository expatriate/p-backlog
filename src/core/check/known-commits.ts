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

type CreationSite = { commit: string; path: string };

type CreationQuestion = { taskId: string; site: CreationSite; changes: Commit[] };

type CreationCopies = {
  broughtByMerge: (merge: Commit, site: CreationSite) => Promise<string[] | null>;
  copiesOf: (site: CreationSite) => Promise<ReadonlySet<string>>;
};

export async function commitsKnownAtCreation({ repo, tasks, facts, anchors, origins, git = runGit }: KnownCommitsQuestion): Promise<KnownCommits> {
  const questions = tasks.flatMap((task): CreationQuestion[] => {
    const origin = origins.get(task.id);
    if (origin === undefined || task.verified !== undefined || task.source === undefined || !judgedByCommits(task, anchors)) return [];
    const path = sourcePath(task.source);
    return [{ taskId: task.id, site: { commit: origin.commit, path }, changes: commitsTouchingSince(facts.commits, path, reviewMark(task)) }];
  });
  const copies = creationCopies(repo, git);
  const answers = await Promise.all(
    questions.map(async ({ taskId, site, changes }) => {
      const known = await Promise.all(changes.map(async (commit) => ((await isKnownAtCreation(copies, commit, site)) ? [commit.sha] : [])));
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
    broughtByMerge: (merge, { commit, path }) =>
      remembered(branchCommitsByMerge, `${merge.sha} ${commit} ${path}`, async () =>
        outputLines(await git(repo, ["rev-list", `${merge.sha}^2`, `^${merge.sha}^1`, `^${commit}`, "--", ...literalPathspecs([path])])),
      ),
    copiesOf: ({ commit, path }) => remembered(copiesByCreation, `${commit} ${path}`, async () => new Set(await carryingContent(commit, literalPathspecs([path])))),
  };
}

async function isKnownAtCreation(copies: CreationCopies, commit: Commit, site: CreationSite): Promise<boolean> {
  if (commit.parents.length !== MERGE_PARENTS) return (await copies.copiesOf(site)).has(commit.sha);
  const brought = await copies.broughtByMerge(commit, site);
  if (brought === null) return false;
  if (brought.length === 0) return true;
  const copied = await copies.copiesOf(site);
  return brought.every((sha) => copied.has(sha));
}
