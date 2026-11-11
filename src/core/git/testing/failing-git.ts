import { runGitOutcome, type GitOutcomeRunner } from "../run";

export const gitFailing =
  (fails: (args: string[], input: string | undefined) => boolean): GitOutcomeRunner =>
  async (repo, args, input) =>
    fails(args, input) ? { status: "exited", exitCode: 128, stderr: "fatal: сбой" } : runGitOutcome(repo, args, input);
