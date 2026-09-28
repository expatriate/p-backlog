import { runGit, type GitRunner } from "../git/run";
import type { TaskOrigin } from "../journal/events";

export type PendingQuestion = { repo: string; taskIds: readonly string[]; origins: ReadonlyMap<string, TaskOrigin>; git?: GitRunner };

export async function awaitingMerge({ repo, taskIds, origins, git = runGit }: PendingQuestion): Promise<Set<string>> {
  const branched = taskIds.flatMap((id) => {
    const origin = origins.get(id);
    return origin?.branch === undefined ? [] : [{ id, commit: origin.commit, branch: origin.branch }];
  });
  if (branched.length === 0) return new Set();
  const current = (await git(repo, ["rev-parse", "--abbrev-ref", "HEAD"]))?.trim();
  const pending = await Promise.all(
    branched.map(async ({ id, commit, branch }) => {
      if (branch === current) return [];
      const [merged, alive] = await Promise.all([
        git(repo, ["merge-base", "--is-ancestor", commit, "HEAD"]),
        git(repo, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`]),
      ]);
      return merged === null && alive !== null ? [id] : [];
    }),
  );
  return new Set(pending.flat());
}
