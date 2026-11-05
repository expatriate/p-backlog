import { asGitRunner, outputLine, runGitOutcome, stdoutOf, type GitOutcome, type GitOutcomeRunner } from "../git/run";
import type { TaskOrigin } from "../journal/events";
import { remembered } from "../remembered";
import { landingState, type LandingState } from "./landed-content";

export type PendingQuestion = { repo: string; taskIds: readonly string[]; origins: ReadonlyMap<string, TaskOrigin>; git?: GitOutcomeRunner };

type MergeWait = { pending: ReadonlySet<string>; unknownBranches: string[] };

type BranchState = LandingState | "deleted";

type CloneCompleteness = "shallow" | "full" | "unknown";

const NOT_AN_ANCESTOR_EXIT = 1;

const NO_SUCH_REF_EXIT = 1;

export async function awaitingMerge({ repo, taskIds, origins, git = runGitOutcome }: PendingQuestion): Promise<MergeWait> {
  const branched = taskIds.flatMap((id) => {
    const origin = origins.get(id);
    return origin?.branch === undefined ? [] : [{ id, commit: origin.commit, branch: origin.branch }];
  });
  if (branched.length === 0) return { pending: new Set(), unknownBranches: [] };
  const current = lineOf(await git(repo, ["rev-parse", "--abbrev-ref", "HEAD"]));
  const branchStates = new Map<string, Promise<BranchState>>();
  let completenessLookup: Promise<CloneCompleteness> | undefined;
  const cloneCompleteness = () => (completenessLookup ??= cloneCompletenessOf(repo, git));
  const nested = await Promise.all(
    branched.map(async ({ id, commit, branch }) => {
      if (branch === current) return [];
      const ancestry = await git(repo, ["merge-base", "--is-ancestor", commit, "HEAD"]);
      if (ancestry.status === "unfinished") return [{ id, branch, state: "unknown" as const }];
      if (ancestry.status === "ok") return [];
      const creationCommitUnreadable = ancestry.exitCode !== NOT_AN_ANCESTOR_EXIT;
      if (creationCommitUnreadable && (await cloneCompleteness()) === "full") return [];
      const state = await remembered(branchStates, branch, () => branchState(repo, branch, git));
      const pendingOnlyIfShallow = creationCommitUnreadable && state === "pending" && (await cloneCompleteness()) === "unknown";
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
  const tip = lineOf(lookup);
  if (tip !== null) return landingState(repo, tip, asGitRunner(git));
  return lookup.status === "exited" && lookup.exitCode === NO_SUCH_REF_EXIT ? "deleted" : "unknown";
}

async function cloneCompletenessOf(repo: string, git: GitOutcomeRunner): Promise<CloneCompleteness> {
  const answer = lineOf(await git(repo, ["rev-parse", "--is-shallow-repository"]));
  if (answer === "true") return "shallow";
  if (answer === "false") return "full";
  return "unknown";
}

function lineOf(outcome: GitOutcome): string | null {
  return outputLine(stdoutOf(outcome));
}
