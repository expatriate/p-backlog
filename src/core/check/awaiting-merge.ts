import { asGitRunner, commitHashOf, outputLine, runGitOutcome, stdoutOf, type GitOutcome, type GitOutcomeRunner } from "../git/run";
import type { Task } from "../model/types";
import { remembered } from "../remembered";
import { landingState, type LandingState } from "./landed-content";
import { latestRecordedCommit, type MarkCommits } from "./reviewed-task";
import { taskBases, type TaskBases } from "./task-base";

export type PendingQuestion = { repo: string; tasks: readonly Task[]; marks: MarkCommits; git?: GitOutcomeRunner; bases?: TaskBases };

type MergeWait = { pending: ReadonlySet<string>; unknownBranches: string[] };

type BranchState = LandingState | "deleted";

const NO_SUCH_REF_EXIT = 1;

export async function awaitingMerge({ repo, tasks, marks, git = runGitOutcome, bases = taskBases(repo, marks, git) }: PendingQuestion): Promise<MergeWait> {
  const branched = tasks.flatMap((task) => {
    const branch = marks.origins.get(task.id)?.branch;
    const recordedCommit = latestRecordedCommit(task, marks);
    return branch === undefined || recordedCommit === undefined ? [] : [{ id: task.id, recordedCommit, branch }];
  });
  if (branched.length === 0) return { pending: new Set(), unknownBranches: [] };
  const current = lineOf(await git(repo, ["rev-parse", "--abbrev-ref", "HEAD"]));
  const branchStates = new Map<string, Promise<BranchState>>();
  const nested = await Promise.all(
    branched.map(async ({ id, recordedCommit, branch }) => {
      if (branch === current) return [];
      const ancestry = await bases.ancestry(recordedCommit);
      if (ancestry === "unknown") return [{ id, branch, state: "unknown" as const }];
      if (ancestry === "ancestor") return [];
      const recordedCommitMissing = ancestry === "missing";
      if (recordedCommitMissing && (await bases.cloneCompleteness()) === "full") return [];
      const state = await remembered(branchStates, branch, () => branchState(repo, branch, git));
      const pendingOnlyIfShallow = recordedCommitMissing && state === "pending" && (await bases.cloneCompleteness()) === "unknown";
      return [{ id, branch, state: pendingOnlyIfShallow ? ("unknown" as const) : state }];
    }),
  );
  const verdicts = nested.flat();
  const pending = verdicts.filter(({ state }) => state === "pending").map(({ id }) => id);
  const unknownBranches = new Set(verdicts.filter(({ state }) => state === "unknown").map(({ branch }) => branch));
  return { pending: new Set(pending), unknownBranches: [...unknownBranches].sort() };
}

async function branchState(repo: string, branch: string, git: GitOutcomeRunner): Promise<BranchState> {
  const lookup = await git(repo, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`]);
  const tip = commitHashOf(lineOf(lookup));
  if (tip !== null) return landingState(repo, tip, asGitRunner(git));
  return lookup.status === "exited" && lookup.exitCode === NO_SUCH_REF_EXIT ? "deleted" : "unknown";
}

function lineOf(outcome: GitOutcome): string | null {
  return outputLine(stdoutOf(outcome));
}
