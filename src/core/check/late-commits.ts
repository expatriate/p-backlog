import { asGitRunner, commitHashOf, objectIds, runGitOutcome, type CommitHash, type GitOutcomeRunner, type GitRunner } from "../git/run";
import type { TaskOrigin } from "../journal/events";
import type { Task } from "../model/types";
import { sourcePath } from "../model/source";
import { judgedByCommits, type AnchorStates, type KnownCommits } from "./candidates";
import { ancestorsOfHead, headCommitsAt, isInsideRepo, mainlineCommitsOff, type Commit, type IsAncestorOfHead, type RepoFacts } from "./repo-facts";
import { checkoutAtMark, reviewMark } from "./reviewed-task";
import { changesSinceMark, commitsTouchingUntil, type LateCommits } from "./source-commits";

export type LateCommitsQuestion = { repo: string; tasks: readonly Task[]; facts: RepoFacts; anchors: AnchorStates; origins: ReadonlyMap<string, TaskOrigin>; knownCommits: KnownCommits; git?: GitOutcomeRunner };

export type LateArrivals = { late: LateCommits; unknown: ReadonlySet<string> };

type MarkedSource = { taskId: string; path: string; mark: number; checkout: string };

type EditedSource = MarkedSource & { checkout: CommitHash };

type Arrival = { taskId: string; commits: Commit[] | null };

type RepoHistory = { repo: string; git: GitRunner; isAncestorOfHead: IsAncestorOfHead };

const NO_LATE_COMMITS: LateCommits = new Map();

const NO_LATE_ARRIVALS: LateArrivals = { late: NO_LATE_COMMITS, unknown: new Set() };

export async function commitsArrivedLate(question: LateCommitsQuestion): Promise<LateArrivals> {
  if (question.facts.history !== "read") return NO_LATE_ARRIVALS;
  const { repo, git = runGitOutcome } = question;
  const history: RepoHistory = { repo, git: asGitRunner(git), isAncestorOfHead: ancestorsOfHead(repo, git) };
  const arrivals = await arrivalsOf(history, await markedSources(question));
  return {
    late: new Map(arrivals.flatMap(({ taskId, commits }) => (commits === null ? [] : [[taskId, commits] as const]))),
    unknown: new Set(arrivals.filter(({ commits }) => commits === null).map(({ taskId }) => taskId)),
  };
}

async function arrivalsOf(history: RepoHistory, marked: readonly MarkedSource[]): Promise<Arrival[]> {
  const edited = await editedSinceCheckout(history, marked);
  if (edited === null) return marked.map(({ taskId }) => ({ taskId, commits: null }));
  const checkouts = [...new Set(edited.map(({ checkout }) => checkout))];
  const byCheckout = await Promise.all(
    checkouts.map((checkout) =>
      arrivedAfter(
        history,
        checkout,
        edited.filter((source) => source.checkout === checkout),
      ),
    ),
  );
  return byCheckout.flat();
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

async function editedSinceCheckout({ repo, git }: RepoHistory, sources: readonly MarkedSource[]): Promise<EditedSource[] | null> {
  const objects = ({ checkout, path }: MarkedSource) => ({ commit: `${checkout}^{commit}`, atCheckout: `${checkout}^{commit}:./${path}`, atHead: `HEAD:./${path}` });
  const ids = await objectIds(
    git,
    repo,
    sources.flatMap((source) => Object.values(objects(source))),
  );
  if (ids === null) return null;
  return sources.flatMap((source) => {
    const { commit, atCheckout, atHead } = objects(source);
    const checkout = commitHashOf(ids.get(commit) ?? null);
    return checkout === null || ids.get(atCheckout) === ids.get(atHead) ? [] : [{ ...source, checkout }];
  });
}

async function arrivedAfter({ repo, git, isAncestorOfHead }: RepoHistory, checkout: CommitHash, sources: readonly EditedSource[]): Promise<Arrival[]> {
  const descentFromCheckout = await isAncestorOfHead(checkout);
  if (descentFromCheckout === false) return [];
  const arrived = descentFromCheckout === null ? null : await mainlineCommitsOff(repo, checkout, [...new Set(sources.map(({ path }) => path))], git);
  return sources.map(({ taskId, path, mark }) => ({ taskId, commits: arrived === null ? null : commitsTouchingUntil(arrived, path, mark) }));
}
