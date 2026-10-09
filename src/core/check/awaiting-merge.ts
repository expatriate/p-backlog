import { outputLine, runGitOutcome, stdoutOf, type GitOutcome, type GitOutcomeRunner } from "../git/run";
import type { TaskOrigin } from "../journal/events";
import { remembered } from "../remembered";
import { contentLanded } from "./landed-content";

export type PendingQuestion = { repo: string; taskIds: readonly string[]; origins: ReadonlyMap<string, TaskOrigin>; git?: GitOutcomeRunner };

const NOT_AN_ANCESTOR_EXIT = 1;

export async function awaitingMerge({ repo, taskIds, origins, git = runGitOutcome }: PendingQuestion): Promise<Set<string>> {
  const branched = taskIds.flatMap((id) => {
    const origin = origins.get(id);
    return origin?.branch === undefined ? [] : [{ id, commit: origin.commit, branch: origin.branch }];
  });
  if (branched.length === 0) return new Set();
  const current = lineOf(await git(repo, ["rev-parse", "--abbrev-ref", "HEAD"]));
  const awaitingBranches = new Map<string, Promise<boolean>>();
  const pending = await Promise.all(
    branched.map(async ({ id, commit, branch }) => {
      if (branch === current) return [];
      const ancestry = await git(repo, ["merge-base", "--is-ancestor", commit, "HEAD"]);
      const notAnAncestor = ancestry.status === "exited" && ancestry.exitCode === NOT_AN_ANCESTOR_EXIT;
      if (!notAnAncestor) return [];
      return (await remembered(awaitingBranches, branch, () => branchAwaitsMerge(repo, branch, git))) ? [id] : [];
    }),
  );
  return new Set(pending.flat());
}

async function branchAwaitsMerge(repo: string, branch: string, git: GitOutcomeRunner): Promise<boolean> {
  const tip = lineOf(await git(repo, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`]));
  return tip !== null && !(await contentLanded(repo, tip, async (dir, args, input) => stdoutOf(await git(dir, args, input))));
}

function lineOf(outcome: GitOutcome): string | null {
  return outputLine(stdoutOf(outcome));
}
