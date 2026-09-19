import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { CommitUnit, FixCommit, RepoCode } from "../stats/types";
import { isTestPath } from "./test-paths";

export type GitRunner = (repo: string, args: string[]) => Promise<string | null>;

const runFile = promisify(execFile);
const RECORD = "\x1e";
const FIELD = "\x1f";
const LOG_RECORD_SEPARATOR = `${RECORD}\0\n`;
const GIT_OUTPUT_LIMIT = 64 * 1024 * 1024;
const LOCK_FILES = ["package-lock.json", "yarn.lock", "pnpm-lock.yaml"];
const LOCK_EXCLUDES = LOCK_FILES.map((name) => `:!*${name}`);
const NON_CODE_EXTENSIONS = [".md", ".mdx", ".svg"];
const CHURN_EXCLUDES = [...LOCK_EXCLUDES, ...NON_CODE_EXTENSIONS.map((ext) => `:!*${ext}`)];
const MAIN_REFS = ["origin/HEAD", "main", "master"];
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

export async function readRepoCode(git: GitRunner, repo: string, since: Date, mainCommit?: string | null): Promise<RepoCode | null> {
  const resolvedMainCommit = mainCommit === undefined ? await readMainCommit(git, repo) : mainCommit;
  const [log, grep, units] = await Promise.all([
    git(repo, ["log", `--since=${since.toISOString()}`, `--format=tformat:${RECORD}`, "--name-only", "-M", "--relative", "-z", "--", "."]),
    git(repo, ["grep", "-I", "-c", "-z", "", "HEAD", "--", ".", ...LOCK_EXCLUDES]),
    readUnits(git, repo, since, resolvedMainCommit),
  ]);
  if (log === null) return null;
  return { commits: parseCommits(log), lines: parseLines(grep ?? ""), units };
}

export async function readMainCommit(git: GitRunner, repo: string): Promise<string | null> {
  for (const ref of MAIN_REFS) {
    const output = await git(repo, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
    if (output !== null) return output.trim();
  }
  const head = await git(repo, ["rev-parse", "--verify", "--quiet", "HEAD^{commit}"]);
  return head === null ? null : head.trim();
}

export async function readFixCommit(git: GitRunner, repo: string, hash: string): Promise<FixCommit | null> {
  const commit = `${hash}^{commit}`;
  const header = await git(repo, ["log", "-1", `--format=%cI${FIELD}%(trailers:key=Co-authored-by,valueonly,separator=${FIELD})`, commit, "--"]);
  if (header === null) return null;
  const stats = await git(repo, ["show", "--numstat", "--format=", "--diff-merges=first-parent", commit, "--relative", "--", ".", ...CHURN_EXCLUDES]);
  const [date = "", ...trailers] = header.trim().split(FIELD);
  const rows = (stats ?? "").split("\n");
  return {
    date,
    byAgent: trailers.some((trailer) => AGENT_TRAILER.test(trailer.trim())),
    lines: numstatLines(rows),
    testLines: numstatLines(rows.filter((row) => isTestPath(row.split("\t")[2] ?? ""))),
  };
}

async function readUnits(git: GitRunner, repo: string, since: Date, mainCommit: string | null): Promise<CommitUnit[]> {
  if (mainCommit === null) return [];
  const output = await git(repo, [
    "log",
    mainCommit,
    "--first-parent",
    "--diff-merges=first-parent",
    `--since=${since.toISOString()}`,
    `--format=tformat:${RECORD}%cI`,
    "--numstat",
    "--relative",
    "--",
    ".",
    ...CHURN_EXCLUDES,
  ]);
  return output === null ? [] : parseUnits(output);
}

function parseUnits(output: string): CommitUnit[] {
  return output
    .split(RECORD)
    .filter((record) => record.trim() !== "")
    .map((record) => {
      const [date = "", ...rows] = record.split("\n");
      return { date: date.trim(), lines: numstatLines(rows) };
    });
}

function numstatLines(rows: readonly string[]): number {
  return rows.reduce((sum, row) => {
    const [added = "", deleted = ""] = row.split("\t");
    const changed = Number(added) + Number(deleted);
    return row.trim() === "" || Number.isNaN(changed) ? sum : sum + changed;
  }, 0);
}

function parseCommits(output: string): string[][] {
  return output
    .split(LOG_RECORD_SEPARATOR)
    .map((record) => record.split("\0").filter((file) => file !== ""))
    .filter((files) => files.length > 0);
}

function parseLines(output: string): { path: string; lines: number }[] {
  return output
    .split("\n")
    .filter((record) => record.startsWith(GREP_PREFIX))
    .map((record) => {
      const [path = "", count = ""] = record.slice(GREP_PREFIX.length).split("\0");
      return { path, lines: Number(count) };
    });
}
