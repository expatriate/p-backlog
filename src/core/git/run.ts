import { execFile } from "node:child_process";
import { promisify } from "node:util";

export type GitRunner = (repo: string, args: string[]) => Promise<string | null>;

export const RECORD = "\x1e";
export const FIELD = "\x1f";

const runFile = promisify(execFile);
const GIT_OUTPUT_LIMIT = 64 * 1024 * 1024;
const GREP_NO_MATCH_EXIT = 1;

export const runGit: GitRunner = async (repo, args) => {
  try {
    const { stdout } = await runFile("git", ["-C", repo, "--no-optional-locks", "-c", "core.quotePath=false", ...args], { maxBuffer: GIT_OUTPUT_LIMIT });
    return stdout;
  } catch (error) {
    return args[0] === "grep" && exitCodeOf(error) === GREP_NO_MATCH_EXIT ? "" : null;
  }
};

function exitCodeOf(error: unknown): unknown {
  return typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
}
