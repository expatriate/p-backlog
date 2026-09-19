import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { FixCommit, RepoCode } from "../stats/types";

export type GitRunner = (repo: string, args: string[]) => Promise<string | null>;

const runFile = promisify(execFile);
const RECORD = "\x1e";
const FIELD = "\x1f";
const GIT_OUTPUT_LIMIT = 64 * 1024 * 1024;
const LOCK_FILES = ["package-lock.json", "yarn.lock", "pnpm-lock.yaml"];
const AGENT_TRAILER = /^claude/i;
const GREP_PREFIX = "HEAD:";

export const runGit: GitRunner = async (repo, args) => {
  try {
    const { stdout } = await runFile("git", ["-C", repo, "--no-optional-locks", "-c", "core.quotePath=false", ...args], { maxBuffer: GIT_OUTPUT_LIMIT });
    return stdout;
  } catch {
    return null;
  }
};

export async function readHead(git: GitRunner, repo: string): Promise<string | null> {
  const output = await git(repo, ["rev-parse", "--verify", "--quiet", "HEAD"]);
  const head = output?.trim() ?? "";
  return head === "" ? null : head;
}

export async function readRepoCode(git: GitRunner, repo: string, since: Date): Promise<RepoCode | null> {
  const [log, grep] = await Promise.all([
    git(repo, ["log", `--since=${since.toISOString()}`, `--format=tformat:${RECORD}`, "--name-only", "-M"]),
    git(repo, ["grep", "-I", "-c", "", "HEAD", "--", ".", ...LOCK_FILES.map((name) => `:!*${name}`)]),
  ]);
  if (log === null) return null;
  return { commits: parseCommits(log), lines: parseLines(grep ?? "") };
}

export async function readFixCommit(git: GitRunner, repo: string, hash: string): Promise<FixCommit | null> {
  const output = await git(repo, ["log", "-1", `--format=%cI${FIELD}%(trailers:key=Co-authored-by,valueonly,separator=${FIELD})`, `${hash}^{commit}`, "--"]);
  if (output === null) return null;
  const [date = "", ...trailers] = output.trim().split(FIELD);
  return { date, byAgent: trailers.some((trailer) => AGENT_TRAILER.test(trailer.trim())) };
}

function parseCommits(output: string): string[][] {
  return output
    .split(RECORD)
    .map((record) => record.split("\n").filter((line) => line.trim() !== ""))
    .filter((files) => files.length > 0);
}

function parseLines(output: string): { path: string; lines: number }[] {
  return output
    .split("\n")
    .filter((line) => line.startsWith(GREP_PREFIX))
    .map((line) => {
      const separator = line.lastIndexOf(":");
      return { path: line.slice(GREP_PREFIX.length, separator), lines: Number(line.slice(separator + 1)) };
    });
}
