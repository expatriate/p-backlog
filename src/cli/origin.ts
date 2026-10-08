import type { TaskOrigin } from "../core/journal/events";
import { outputLine, runGit } from "../core/git/run";

const DETACHED_HEAD = "HEAD";

export async function readOrigin(dir: string): Promise<TaskOrigin | undefined> {
  const [commit, branch] = await Promise.all([gitLine(dir, ["rev-parse", "--short", "HEAD"]), gitLine(dir, ["rev-parse", "--abbrev-ref", "HEAD"])]);
  if (commit === null) return undefined;
  return branch === null || branch === DETACHED_HEAD ? { commit } : { branch, commit };
}

async function gitLine(dir: string, args: string[]): Promise<string | null> {
  return outputLine(await runGit(dir, args));
}
