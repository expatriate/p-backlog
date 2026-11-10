import { commitHashOf, objectIds, runGit, type CommitHash } from "../git/run";
import type { TaskOrigin } from "../journal/events";
import type { Task } from "../model/types";
import { sourcePath } from "../model/source";
import { judgedByCommits, type AnchorStates, type KnownCommits } from "./candidates";
import { headCommitsAt, isInsideRepo, mainlineCommitsOff, type Commit, type RepoFacts } from "./repo-facts";
import { checkoutAtMark, reviewMark } from "./reviewed-task";
import { changesSinceMark, commitsTouchingUntil, type LateCommits } from "./source-commits";

export type LateCommitsQuestion = { repo: string; tasks: readonly Task[]; facts: RepoFacts; anchors: AnchorStates; origins: ReadonlyMap<string, TaskOrigin>; knownCommits: KnownCommits };

type MarkedSource = { taskId: string; path: string; mark: number; checkout: string };

type EditedSource = MarkedSource & { checkout: CommitHash };

const NO_LATE_COMMITS: LateCommits = new Map();

export async function commitsArrivedLate(question: LateCommitsQuestion): Promise<LateCommits> {
  if (question.facts.history !== "read") return NO_LATE_COMMITS;
  const { repo } = question;
  const edited = await editedSinceCheckout(repo, await markedSources(question));
  const checkouts = [...new Set(edited.map(({ checkout }) => checkout))];
  const late = await Promise.all(
    checkouts.map((checkout) =>
      arrivedAfter(
        repo,
        checkout,
        edited.filter((source) => source.checkout === checkout),
      ),
    ),
  );
  return new Map(late.flat());
}

async function markedSources({ repo, tasks, facts, anchors, origins, knownCommits }: LateCommitsQuestion): Promise<MarkedSource[]> {
  const headCommitAt = headCommitsAt(repo);
  const sourcesByTask = await Promise.all(
    tasks.map(async (task) => {
      if (task.source === undefined || !judgedByCommits(task, anchors)) return [];
      const path = sourcePath(task.source);
      if (!facts.existing.has(path) || !isInsideRepo(path) || changedByDate(task, path, facts, knownCommits)) return [];
      const checkout = await checkoutAtMark(task, origins, headCommitAt);
      return checkout === null ? [] : [{ taskId: task.id, path, mark: reviewMark(task), checkout }];
    }),
  );
  return sourcesByTask.flat();
}

function changedByDate(task: Task, path: string, facts: RepoFacts, knownCommits: KnownCommits): boolean {
  const { commits, uncommitted } = changesSinceMark({ facts, late: NO_LATE_COMMITS }, task, path);
  return uncommitted || commits.some((commit) => knownCommits.get(task.id)?.has(commit.sha) !== true);
}

async function editedSinceCheckout(repo: string, sources: readonly MarkedSource[]): Promise<EditedSource[]> {
  const objects = ({ checkout, path }: MarkedSource) => ({ commit: `${checkout}^{commit}`, atCheckout: `${checkout}^{commit}:./${path}`, atHead: `HEAD:./${path}` });
  const ids = await objectIds(
    runGit,
    repo,
    sources.flatMap((source) => Object.values(objects(source))),
  );
  if (ids === null) return [];
  return sources.flatMap((source) => {
    const { commit, atCheckout, atHead } = objects(source);
    const checkout = commitHashOf(ids.get(commit) ?? null);
    return checkout === null || ids.get(atCheckout) === ids.get(atHead) ? [] : [{ ...source, checkout }];
  });
}

async function arrivedAfter(repo: string, checkout: CommitHash, sources: readonly EditedSource[]): Promise<[string, Commit[]][]> {
  const headDescendsFromCheckout = (await runGit(repo, ["merge-base", "--is-ancestor", checkout, "HEAD"])) !== null;
  if (!headDescendsFromCheckout) return [];
  const arrived = (await mainlineCommitsOff(repo, checkout, [...new Set(sources.map(({ path }) => path))])) ?? [];
  return sources.map(({ taskId, path, mark }) => [taskId, commitsTouchingUntil(arrived, path, mark)]);
}
