import type { TaskOrigin } from "../core/journal/events";
import { outputLine, runGit } from "../core/git/run";

const DETACHED_HEAD = "HEAD";

export async function readOrigin(dir: string): Promise<TaskOrigin | undefined> {
  const [commit, branch] = await Promise.all([readHeadCommit(dir), gitLine(dir, ["rev-parse", "--abbrev-ref", "HEAD"])]);
  if (commit === undefined) return undefined;
  return branch === null || branch === DETACHED_HEAD ? { commit } : { branch, commit };
}

export async function readHeadCommit(dir: string): Promise<string | undefined> {
  return (await gitLine(dir, ["rev-parse", "--short", "HEAD"])) ?? undefined;
}

async function gitLine(dir: string, args: string[]): Promise<string | null> {
  return outputLine(await runGit(dir, args));
}
