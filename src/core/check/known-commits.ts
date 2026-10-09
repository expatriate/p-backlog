import { literalPathspecs, runGit, type GitRunner } from "../git/run";
import type { TaskOrigin } from "../journal/events";
import type { Task } from "../model/types";
import { remembered } from "../remembered";
import { commitsAfter, judgedByCommits, reviewMark, touches, type AnchorStates, type KnownCommits } from "./candidates";
import { commitsCarryingContent } from "./landed-content";
import { sourcePath } from "../model/source";
import type { Commit, RepoFacts } from "./repo-facts";

const MERGE_PARENTS = 2;

export type KnownCommitsQuestion = { repo: string; tasks: readonly Task[]; facts: RepoFacts; anchors: AnchorStates; origins: ReadonlyMap<string, TaskOrigin>; git?: GitRunner };

type CreationQuestion = { taskId: string; creation: string; path: string; changes: Commit[] };

export async function commitsKnownAtCreation({ repo, tasks, facts, anchors, origins, git = runGit }: KnownCommitsQuestion): Promise<KnownCommits> {
  const questions = tasks.flatMap((task): CreationQuestion[] => {
    const origin = origins.get(task.id);
    if (origin === undefined || task.verified !== undefined || task.source === undefined || !judgedByCommits(task, anchors)) return [];
    const path = sourcePath(task.source);
    return [{ taskId: task.id, creation: origin.commit, path, changes: commitsAfter(facts.commits, reviewMark(task)).filter((commit) => touches(commit, path)) }];
  });
  const branchCommitsByMerge = new Map<string, Promise<string[] | null>>();
  const commitsBroughtBy = (merge: Commit, creation: string, path: string) =>
    remembered(branchCommitsByMerge, `${merge.sha} ${creation} ${path}`, async () => {
      const shas = await git(repo, ["rev-list", `${merge.sha}^2`, `^${merge.sha}^1`, `^${creation}`, "--", ...literalPathspecs([path])]);
      return shas === null ? null : shas.split("\n").filter((sha) => sha !== "");
    });
  const copyAnswers = new Map<string, Promise<readonly string[]>>();
  const copiesOfCreation = (creation: string, path: string) => remembered(copyAnswers, `${creation} ${path}`, () => commitsCarryingContent(repo, creation, literalPathspecs([path]), git));
  const isCopy = (copies: readonly string[], sha: string) => copies.some((fullSha) => fullSha.startsWith(sha));
  const mergeBringsOnlyCopies = async (merge: Commit, creation: string, path: string) => {
    const brought = await commitsBroughtBy(merge, creation, path);
    if (brought === null) return false;
    const copies = brought.length === 0 ? [] : await copiesOfCreation(creation, path);
    return brought.every((sha) => isCopy(copies, sha));
  };
  const commitIsCopy = async (commit: Commit, creation: string, path: string) => isCopy(await copiesOfCreation(creation, path), commit.sha);
  const isKnown = (commit: Commit, creation: string, path: string) => (commit.parents.length === MERGE_PARENTS ? mergeBringsOnlyCopies(commit, creation, path) : commitIsCopy(commit, creation, path));
  const answers = await Promise.all(
    questions.map(async ({ taskId, creation, path, changes }) => {
      const known = await Promise.all(changes.map(async (commit) => ((await isKnown(commit, creation, path)) ? [commit.sha] : [])));
      return { taskId, known: known.flat() };
    }),
  );
  return new Map(answers.filter(({ known }) => known.length > 0).map(({ taskId, known }) => [taskId, new Set(known)]));
}
