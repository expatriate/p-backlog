import { runGit, type GitRunner } from "../git/run";
import type { TaskOrigin } from "../journal/events";
import type { Task } from "../model/types";
import { remembered } from "../remembered";
import { commitsAfter, judgedByCommits, reviewMark, touches, type AnchorStates, type KnownMerges } from "./candidates";
import { commitsCarryingContent } from "./landed-content";
import { sourcePath } from "../model/source";
import type { Commit, RepoFacts } from "./repo-facts";

const MERGE_PARENTS = 2;

export type MergeCheck = { repo: string; tasks: readonly Task[]; facts: RepoFacts; anchors: AnchorStates; origins: ReadonlyMap<string, TaskOrigin>; git?: GitRunner };

type CreationQuestion = { taskId: string; origin: TaskOrigin; pathspec: string; changes: Commit[] };

export async function mergesKnownAtCreation({ repo, tasks, facts, anchors, origins, git = runGit }: MergeCheck): Promise<KnownMerges> {
  const questions = tasks.flatMap((task): CreationQuestion[] => {
    const origin = origins.get(task.id);
    if (origin === undefined || task.verified !== undefined || task.source === undefined || !judgedByCommits(task, anchors)) return [];
    const path = sourcePath(task.source);
    return [{ taskId: task.id, origin, pathspec: `:(literal)${path}`, changes: commitsAfter(facts.commits, reviewMark(task)).filter((commit) => touches(commit, path)) }];
  });
  const branchCommitsByMerge = new Map<string, Promise<string[] | null>>();
  const commitsBroughtBy = (merge: Commit, creation: string, pathspec: string) =>
    remembered(branchCommitsByMerge, `${merge.sha} ${creation} ${pathspec}`, async () => {
      const shas = await git(repo, ["rev-list", `${merge.sha}^2`, `^${merge.sha}^1`, `^${creation}`, "--", pathspec]);
      return shas === null ? null : shas.split("\n").filter((sha) => sha !== "");
    });
  const copyAnswers = new Map<string, Promise<readonly string[]>>();
  const copiesOfCreation = ({ commit: creation, branch }: TaskOrigin, pathspec: string) =>
    branch === undefined ? Promise.resolve([]) : remembered(copyAnswers, `${creation} ${pathspec}`, () => commitsCarryingContent(repo, creation, pathspec, git));
  const isCopy = (copies: readonly string[], sha: string) => copies.some((fullSha) => fullSha.startsWith(sha));
  const mergeBringsOnlyCopies = async (merge: Commit, origin: TaskOrigin, pathspec: string) => {
    const brought = await commitsBroughtBy(merge, origin.commit, pathspec);
    if (brought === null) return false;
    const copies = brought.length === 0 ? [] : await copiesOfCreation(origin, pathspec);
    return brought.every((sha) => isCopy(copies, sha));
  };
  const commitIsCopy = async (commit: Commit, origin: TaskOrigin, pathspec: string) => isCopy(await copiesOfCreation(origin, pathspec), commit.sha);
  const isKnown = (commit: Commit, origin: TaskOrigin, pathspec: string) => (commit.parents.length === MERGE_PARENTS ? mergeBringsOnlyCopies(commit, origin, pathspec) : commitIsCopy(commit, origin, pathspec));
  const answers = await Promise.all(
    questions.map(async ({ taskId, origin, pathspec, changes }) => {
      const known = await Promise.all(changes.map(async (commit) => ((await isKnown(commit, origin, pathspec)) ? [commit.sha] : [])));
      return { taskId, known: known.flat() };
    }),
  );
  return new Map(answers.filter(({ known }) => known.length > 0).map(({ taskId, known }) => [taskId, new Set(known)]));
}
