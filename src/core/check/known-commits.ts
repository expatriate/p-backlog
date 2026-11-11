import { literalPathspecs, outputLines, runGit, type GitRunner } from "../git/run";
import type { Task } from "../model/types";
import { remembered } from "../remembered";
import { judgedByCommits, type AnchorStates, type KnownCommits } from "./candidates";
import { commitAtMark, reviewMark, type MarkCommits } from "./reviewed-task";
import { commitsTouchingSince } from "./source-commits";
import { commitsCarryingContent } from "./landed-content";
import { sourcePath } from "../model/source";
import { FACTS_HISTORY_OPTIONS, type Commit, type RepoFacts } from "./repo-facts";

const MERGE_PARENTS = 2;

export type KnownCommitsQuestion = { repo: string; tasks: readonly Task[]; facts: RepoFacts; anchors: AnchorStates; marks: MarkCommits; git?: GitRunner };

type MarkSite = { commit: string; path: string };

type MarkQuestion = { taskId: string; site: MarkSite; changes: Commit[] };

type MarkCopies = {
  broughtByMerge: (merge: Commit, site: MarkSite) => Promise<string[] | null>;
  copiesOf: (site: MarkSite) => Promise<ReadonlySet<string>>;
};

export async function commitsKnownAtMark({ repo, tasks, facts, anchors, marks, git = runGit }: KnownCommitsQuestion): Promise<KnownCommits> {
  const questions = tasks.flatMap((task): MarkQuestion[] => {
    const commit = commitAtMark(task, marks);
    if (commit === undefined || task.source === undefined || !judgedByCommits(task, anchors)) return [];
    const path = sourcePath(task.source);
    return [{ taskId: task.id, site: { commit, path }, changes: commitsTouchingSince(facts.commits, path, reviewMark(task)) }];
  });
  const copies = markCopies(repo, git);
  const answers = await Promise.all(
    questions.map(async ({ taskId, site, changes }) => {
      const known = await Promise.all(changes.map(async (commit) => ((await isKnownAtMark(copies, commit, site)) ? [commit.sha] : [])));
      return { taskId, known: known.flat() };
    }),
  );
  return new Map(answers.filter(({ known }) => known.length > 0).map(({ taskId, known }) => [taskId, new Set(known)]));
}

function markCopies(repo: string, git: GitRunner): MarkCopies {
  const carryingContent = commitsCarryingContent(repo, git, FACTS_HISTORY_OPTIONS);
  const branchCommitsByMerge = new Map<string, Promise<string[] | null>>();
  const copiesByMark = new Map<string, Promise<ReadonlySet<string>>>();
  return {
    broughtByMerge: (merge, { commit, path }) =>
      remembered(branchCommitsByMerge, `${merge.sha} ${commit} ${path}`, async () =>
        outputLines(await git(repo, ["rev-list", `${merge.sha}^2`, `^${merge.sha}^1`, `^${commit}`, "--", ...literalPathspecs([path])])),
      ),
    copiesOf: ({ commit, path }) => remembered(copiesByMark, `${commit} ${path}`, async () => new Set(await carryingContent(commit, literalPathspecs([path])))),
  };
}

async function isKnownAtMark(copies: MarkCopies, commit: Commit, site: MarkSite): Promise<boolean> {
  if (commit.parents.length !== MERGE_PARENTS) return (await copies.copiesOf(site)).has(commit.sha);
  const brought = await copies.broughtByMerge(commit, site);
  if (brought === null) return false;
  if (brought.length === 0) return true;
  const copied = await copies.copiesOf(site);
  return brought.every((sha) => copied.has(sha));
}
