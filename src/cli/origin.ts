import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { TaskOrigin } from "../core/journal/events";

const runFile = promisify(execFile);
const DETACHED_HEAD = "HEAD";

export async function readOrigin(dir: string): Promise<TaskOrigin | undefined> {
  const [commit, branch] = await Promise.all([gitLine(dir, ["rev-parse", "--short", "HEAD"]), gitLine(dir, ["rev-parse", "--abbrev-ref", "HEAD"])]);
  if (commit === null) return undefined;
  return branch === null || branch === DETACHED_HEAD ? { commit } : { branch, commit };
}

async function gitLine(dir: string, args: readonly string[]): Promise<string | null> {
  try {
    const { stdout } = await runFile("git", ["-C", dir, "--no-optional-locks", ...args]);
    const line = stdout.trim();
    return line === "" ? null : line;
  } catch {
    return null;
  }
}
