import { asGitRunner, commitHashOf, objectIds, runGitOutcome, type CommitHash, type GitOutcomeRunner, type GitRunner } from "../git/run";
import type { Task } from "../model/types";
import { sourcePath } from "../model/source";
import { judgedByCommits, type AnchorStates, type KnownCommits } from "./candidates";
import { isInsideRepo, mainlineCommitsOff, type Commit, type RepoFacts } from "./repo-facts";
import { reviewMark, type MarkCommits } from "./reviewed-task";
import { changesSinceMark, commitsTouchingUntil, type LateCommits } from "./source-commits";
import { taskBases, type TaskBases } from "./task-base";

export type LateCommitsQuestion = {
  repo: string;
  tasks: readonly Task[];
  facts: RepoFacts;
  anchors: AnchorStates;
  marks: MarkCommits;
  knownCommits: KnownCommits;
  git?: GitOutcomeRunner;
  bases?: TaskBases;
};

export type LateArrivals = { late: LateCommits; unknown: ReadonlySet<string> };

type MarkedSource = { task: Task; path: string; mark: number; markCommit: string };

type EditedSource = MarkedSource & { markCommit: CommitHash };

type Arrival = { taskId: string; commits: Commit[] | null };

type RepoHistory = { repo: string; git: GitRunner; bases: TaskBases };

const NO_LATE_COMMITS: LateCommits = new Map();

const NO_LATE_ARRIVALS: LateArrivals = { late: NO_LATE_COMMITS, unknown: new Set() };

export async function commitsArrivedLate(question: LateCommitsQuestion): Promise<LateArrivals> {
  if (question.facts.history !== "read") return NO_LATE_ARRIVALS;
  const { repo, git = runGitOutcome, bases = taskBases(repo, question.marks, git) } = question;
  const history: RepoHistory = { repo, git: asGitRunner(git), bases };
  const arrivals = await arrivalsOf(history, await markedSources(question, bases));
  return {
    late: new Map(arrivals.flatMap(({ taskId, commits }) => (commits === null ? [] : [[taskId, commits] as const]))),
    unknown: new Set(arrivals.filter(({ commits }) => commits === null).map(({ taskId }) => taskId)),
  };
}

async function arrivalsOf(history: RepoHistory, marked: readonly MarkedSource[]): Promise<Arrival[]> {
  const edited = await editedSinceMarkCommit(history, marked);
  if (edited === null) return marked.map(({ task }) => ({ taskId: task.id, commits: null }));
  const judged = await Promise.all(edited.map(async (source) => ({ source, base: await history.bases.baseOf(source.task) })));
  const unknown = judged.flatMap(({ source, base }) => (base.kind === "unknown" ? [{ taskId: source.task.id, commits: null }] : []));
  const onLine = judged.flatMap(({ source, base }) => (base.kind === "exact" ? [source] : []));
  const markCommits = [...new Set(onLine.map(({ markCommit }) => markCommit))];
  const byMarkCommit = await Promise.all(
    markCommits.map((markCommit) =>
      arrivedAfter(
        history,
        markCommit,
        onLine.filter((source) => source.markCommit === markCommit),
      ),
    ),
  );
  return [...unknown, ...byMarkCommit.flat()];
}

async function markedSources({ tasks, facts, anchors, knownCommits }: LateCommitsQuestion, bases: TaskBases): Promise<MarkedSource[]> {
  const sourcesByTask = await Promise.all(
    tasks.map(async (task) => {
      if (task.source === undefined || !judgedByCommits(task, anchors)) return [];
      const path = sourcePath(task.source);
      if (!facts.existing.has(path) || !isInsideRepo(path) || changedByDate(task, path, facts, knownCommits)) return [];
      const markCommit = await bases.markCommit(task);
      return markCommit === null ? [] : [{ task, path, mark: reviewMark(task), markCommit }];
    }),
  );
  return sourcesByTask.flat();
}

function changedByDate(task: Task, path: string, facts: RepoFacts, knownCommits: KnownCommits): boolean {
  const { commits, uncommitted } = changesSinceMark({ facts, late: NO_LATE_COMMITS }, task, path);
  return uncommitted || commits.some((commit) => knownCommits.get(task.id)?.has(commit.sha) !== true);
}

async function editedSinceMarkCommit({ repo, git }: RepoHistory, sources: readonly MarkedSource[]): Promise<EditedSource[] | null> {
  const objects = ({ markCommit, path }: MarkedSource) => ({ commit: `${markCommit}^{commit}`, atMark: `${markCommit}^{commit}:./${path}`, atHead: `HEAD:./${path}` });
  const ids = await objectIds(
    git,
    repo,
    sources.flatMap((source) => Object.values(objects(source))),
  );
  if (ids === null) return null;
  return sources.flatMap((source) => {
    const { commit, atMark, atHead } = objects(source);
    const markCommit = commitHashOf(ids.get(commit) ?? null);
    return markCommit === null || ids.get(atMark) === ids.get(atHead) ? [] : [{ ...source, markCommit }];
  });
}

async function arrivedAfter({ repo, git }: RepoHistory, markCommit: CommitHash, sources: readonly EditedSource[]): Promise<Arrival[]> {
  const arrived = await mainlineCommitsOff(repo, markCommit, [...new Set(sources.map(({ path }) => path))], git);
  return sources.map(({ task, path, mark }) => ({ taskId: task.id, commits: arrived === null ? null : commitsTouchingUntil(arrived, path, mark) }));
}
