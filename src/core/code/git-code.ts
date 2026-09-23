import { FIELD, RECORD, type GitRunner } from "../git/run";
import type { CommitUnit, FixCommit, RepoCode } from "../stats/types";
import { isTestPath } from "./test-paths";

const LOCK_FILES = ["package-lock.json", "yarn.lock", "pnpm-lock.yaml"];
const LOCK_EXCLUDES = LOCK_FILES.map((name) => `:!*${name}`);
const NON_CODE_EXTENSIONS = [".md", ".mdx", ".svg"];
const CHURN_EXCLUDES = [...LOCK_EXCLUDES, ...NON_CODE_EXTENSIONS.map((ext) => `:!*${ext}`)];
const MAIN_REFS = ["origin/HEAD", "main", "master"];
const AGENT_TRAILER = /^claude/i;
const GREP_PREFIX = "HEAD:";

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
  if (log === null || grep === null) return null;
  return { commits: parseCommits(log), lines: parseLines(grep), units };
}

export async function readMainCommit(git: GitRunner, repo: string): Promise<string | null> {
  for (const ref of MAIN_REFS) {
    const output = await git(repo, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
    if (output !== null) return output.trim();
  }
  const head = await git(repo, ["rev-parse", "--verify", "--quiet", "HEAD^{commit}"]);
  return head === null ? null : head.trim();
}

export async function readFixCommits(git: GitRunner, repo: string, hashes: readonly string[]): Promise<Map<string, FixCommit>> {
  if (hashes.length === 0) return new Map();
  const batch = await readFixBatch(git, repo, hashes);
  if (batch !== null) return batch;
  const known = await knownHashes(git, repo, hashes);
  return known.length === 0 ? new Map() : ((await readFixBatch(git, repo, known)) ?? new Map());
}

async function knownHashes(git: GitRunner, repo: string, hashes: readonly string[]): Promise<string[]> {
  const checked = await Promise.all(hashes.map(async (hash) => ((await git(repo, ["rev-parse", "--verify", "--quiet", `${hash}^{commit}`])) === null ? [] : [hash])));
  return checked.flat();
}

async function readFixBatch(git: GitRunner, repo: string, hashes: readonly string[]): Promise<Map<string, FixCommit> | null> {
  const commits = hashes.map((hash) => `${hash}^{commit}`);
  const [headers, stats] = await Promise.all([
    git(repo, ["log", "--no-walk=unsorted", ...commits, `--format=tformat:${RECORD}%H${FIELD}%cI${FIELD}%(trailers:key=Co-authored-by,valueonly,separator=${FIELD})`, "--"]),
    git(repo, ["log", "--no-walk=unsorted", ...commits, `--format=tformat:${RECORD}%H`, "--numstat", "--diff-merges=first-parent", "--relative", "--", ".", ...CHURN_EXCLUDES]),
  ]);
  if (headers === null) return null;
  const changedLines = new Map(parseFixStats(stats ?? ""));
  const byFullHash = new Map(parseFixHeaders(headers, changedLines));
  return new Map(hashes.flatMap((hash) => matchHash(byFullHash, hash)));
}

function matchHash(commits: ReadonlyMap<string, FixCommit>, hash: string): [string, FixCommit][] {
  const full = [...commits.keys()].find((candidate) => candidate.startsWith(hash));
  const commit = full === undefined ? undefined : commits.get(full);
  return commit === undefined ? [] : [[hash, commit]];
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
  return rows.reduce((sum, row) => {
    const [added = "", deleted = ""] = row.split("\t");
    const changed = Number(added) + Number(deleted);
    return row.trim() === "" || Number.isNaN(changed) ? sum : sum + changed;
  }, 0);
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
