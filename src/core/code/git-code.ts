import { FIELD, RECORD, resolveCommits, type GitRunner } from "../git/run";
import { sum } from "../stats/numbers";
import type { CommitUnit, FixCommit, RepoCode } from "../stats/types";
import { isTestPath } from "./test-paths";

const LOCK_FILES = ["package-lock.json", "yarn.lock", "pnpm-lock.yaml"];
const LOCK_EXCLUDES = LOCK_FILES.map((name) => `:!*${name}`);
const NON_CODE_EXTENSIONS = [".md", ".mdx", ".svg"];
const CHURN_EXCLUDES = [...LOCK_EXCLUDES, ...NON_CODE_EXTENSIONS.map((ext) => `:!*${ext}`)];
const HEAD = "HEAD";
const MAIN_REFS = ["origin/HEAD", "main", "master"];
const AGENT_TRAILER = /^claude/i;
const GREP_PREFIX = "HEAD:";

export type RepoRefs = { head: string | null; main: string | null };

export async function readRefs(git: GitRunner, repo: string): Promise<RepoRefs> {
  const commits = (await resolveCommits(git, repo, [HEAD, ...MAIN_REFS])) ?? new Map<string, string>();
  const head = commits.get(HEAD) ?? null;
  const main = MAIN_REFS.map((ref) => commits.get(ref)).find((commit) => commit !== undefined);
  return { head, main: main ?? head };
}

export async function readRepoCode(git: GitRunner, repo: string, since: Date, mainCommit: string | null): Promise<RepoCode | null> {
  const [log, grep, units] = await Promise.all([
    git(repo, ["log", `--since=${since.toISOString()}`, `--format=tformat:${RECORD}`, "--name-only", "-M", "--relative", "-z", "--", "."]),
    git(repo, ["grep", "-I", "-c", "-z", "", "HEAD", "--", ".", ...LOCK_EXCLUDES]),
    readUnits(git, repo, since, mainCommit),
  ]);
  if (log === null || grep === null) return null;
  return { commits: parseCommits(log), lines: parseLines(grep), units };
}

export async function readFixCommits(git: GitRunner, repo: string, hashes: readonly string[]): Promise<Map<string, FixCommit> | null> {
  const fullHashes = await resolveCommits(git, repo, hashes);
  if (fullHashes === null) return null;
  return fullHashes.size === 0 ? new Map() : readFixBatch(git, repo, fullHashes);
}

async function readFixBatch(git: GitRunner, repo: string, fullHashes: ReadonlyMap<string, string>): Promise<Map<string, FixCommit> | null> {
  const commits = [...new Set(fullHashes.values())];
  const [headers, stats] = await Promise.all([
    git(repo, ["log", "--no-walk=unsorted", ...commits, `--format=tformat:${RECORD}%H${FIELD}%cI${FIELD}%(trailers:key=Co-authored-by,valueonly,separator=${FIELD})`, "--"]),
    git(repo, ["log", "--no-walk=unsorted", ...commits, `--format=tformat:${RECORD}%H`, "--numstat", "--diff-merges=first-parent", "--relative", "--", ".", ...CHURN_EXCLUDES]),
  ]);
  if (headers === null || stats === null) return null;
  const changedLines = new Map(parseFixStats(stats));
  const byFullHash = new Map(parseFixHeaders(headers, changedLines));
  return new Map(
    [...fullHashes].flatMap(([hash, full]): [string, FixCommit][] => {
      const commit = byFullHash.get(full);
      return commit === undefined ? [] : [[hash, commit]];
    }),
  );
}

function parseFixHeaders(output: string, changedLines: ReadonlyMap<string, { lines: number; testLines: number }>): [string, FixCommit][] {
  return records(output).map((record): [string, FixCommit] => {
    const [full = "", date = "", ...trailers] = record.split("\n")[0]?.split(FIELD) ?? [];
    const changed = changedLines.get(full) ?? { lines: 0, testLines: 0 };
    return [full, { date, byAgent: trailers.some((trailer) => AGENT_TRAILER.test(trailer.trim())), ...changed }];
  });
}

function parseFixStats(output: string): [string, { lines: number; testLines: number }][] {
  return records(output).map((record): [string, { lines: number; testLines: number }] => {
    const [full = "", ...rows] = record.split("\n");
    return [full.trim(), { lines: numstatLines(rows), testLines: numstatLines(rows.filter((row) => isTestPath(row.split("\t")[2] ?? ""))) }];
  });
}

function records(output: string): string[] {
  return output.split(RECORD).filter((record) => record.trim() !== "");
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
  return sum(rows.filter((row) => row.trim() !== "").map(numstatRowLines).filter((lines) => !Number.isNaN(lines)));
}

function numstatRowLines(row: string): number {
  const [added = "", deleted = ""] = row.split("\t");
  return Number(added) + Number(deleted);
}

function parseCommits(output: string): string[][] {
  return output
    .split(RECORD)
    .map((record) => record.split("\0").map((file) => file.replace(/^\n/, "")).filter((file) => file !== ""))
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
