import { FIELD, RECORD, resolveCommits, type GitRunner } from "../git/run";
import { sum } from "../stats/numbers";
import type { CommitUnit, FixCommit } from "../stats/types";
import { isTestPath } from "./test-paths";

const LOCK_FILES = ["package-lock.json", "yarn.lock", "pnpm-lock.yaml"];
const LOCK_EXCLUDES = LOCK_FILES.map((name) => `:!*${name}`);
const NON_CODE_EXTENSIONS = [".md", ".mdx", ".svg"];
const CHURN_EXCLUDES = [...LOCK_EXCLUDES, ...NON_CODE_EXTENSIONS.map((ext) => `:!*${ext}`)];
const HEAD = "HEAD";
const MAIN_REFS = ["origin/HEAD", "main", "master"];
const AGENT_TRAILER = /^claude/i;
const RENAME_ARROW = " => ";

export type RepoRefs = { head: string | null; main: string | null };

export async function readRefs(git: GitRunner, repo: string): Promise<RepoRefs> {
  const commits = (await resolveCommits(git, repo, [HEAD, ...MAIN_REFS])) ?? new Map<string, string>();
  const head = commits.get(HEAD) ?? null;
  const main = MAIN_REFS.map((ref) => commits.get(ref)).find((commit) => commit !== undefined);
  return { head, main: main ?? head };
}

export type HistoryRange = { tip: string; after?: string | undefined };

export type HistoryRead<T> = { entries: T[]; reachesAfter: boolean };

export type ScannedCommit = { date: string; paths: string[] };

export async function readCommitsSince(git: GitRunner, repo: string, since: Date, range: HistoryRange): Promise<HistoryRead<ScannedCommit> | null> {
  const output = await git(repo, [
    "log",
    revisionsOf(range),
    "--full-history",
    "--sparse",
    `--since=${since.toISOString()}`,
    `--format=tformat:${RECORD}%P${FIELD}%cI`,
    "--name-only",
    "-M",
    "--relative",
    "-z",
    "--",
    ".",
  ]);
  if (output === null) return null;
  const { after } = range;
  const commits = records(output).map((record) => {
    const [header = "", ...files] = record.split("\0");
    return { ...parseHistoryHeader(header), paths: files.map((file) => file.replace(/^\n/, "")).filter((file) => file !== "") };
  });
  return {
    entries: commits.filter(({ paths }) => paths.length > 0).map(({ date, paths }) => ({ date, paths })),
    reachesAfter: after === undefined || commits.some(({ parents }) => parents.includes(after)),
  };
}

export async function readUnits(git: GitRunner, repo: string, since: Date, range: HistoryRange): Promise<HistoryRead<CommitUnit> | null> {
  const output = await git(repo, [
    "log",
    revisionsOf(range),
    "--first-parent",
    "--sparse",
    "--diff-merges=first-parent",
    `--since=${since.toISOString()}`,
    `--format=tformat:${RECORD}%P${FIELD}%cI`,
    "--numstat",
    "--relative",
    "--",
    ".",
    ...CHURN_EXCLUDES,
  ]);
  if (output === null) return null;
  const { after } = range;
  const units = records(output).map((record) => {
    const [header = "", ...rows] = record.split("\n");
    return { ...parseHistoryHeader(header), rows: rows.filter((row) => row.trim() !== "") };
  });
  return {
    entries: units.filter(({ rows }) => rows.length > 0).map(({ date, rows }) => ({ date, lines: numstatLines(rows) })),
    reachesAfter: after === undefined || units.some(({ parents }) => parents[0] === after),
  };
}

export async function readLines(git: GitRunner, repo: string, head: string): Promise<{ path: string; lines: number }[] | null> {
  const output = await git(repo, ["grep", "-I", "-c", "-z", "", head, "--", ".", ...LOCK_EXCLUDES]);
  return output === null ? null : parseLines(output, `${head}:`);
}

function revisionsOf({ tip, after }: HistoryRange): string {
  return after === undefined ? tip : `${after}..${tip}`;
}

function parseHistoryHeader(header: string): { parents: string[]; date: string } {
  const [parents = "", date = ""] = header.split(FIELD);
  return { parents: parents.split(" ").filter((parent) => parent !== ""), date: date.trim() };
}

export type FixCommitsRequest = { hashes: readonly string[]; mainCommit: string | null };

export async function readFixCommits(git: GitRunner, repo: string, { hashes, mainCommit }: FixCommitsRequest): Promise<Map<string, FixCommit> | null> {
  const fullHashes = await resolveCommits(git, repo, hashes);
  if (fullHashes === null) return null;
  return fullHashes.size === 0 ? new Map() : readFixBatch(git, repo, fullHashes, mainCommit);
}

type FixHeader = { full: string; date: string; subject: string; byAgent: boolean };

type FixChanges = { lines: number; testLines: number; paths: string[] };

type LandingQuestion = { fix: FixHeader; paths: readonly string[]; mainCommit: string };

async function readFixBatch(git: GitRunner, repo: string, fullHashes: ReadonlyMap<string, string>, mainCommit: string | null): Promise<Map<string, FixCommit> | null> {
  const commits = [...new Set(fullHashes.values())];
  const [headers, stats] = await Promise.all([
    git(repo, ["log", "--no-walk=unsorted", ...commits, `--format=tformat:${RECORD}%H${FIELD}%cI${FIELD}%s${FIELD}%(trailers:key=Co-authored-by,valueonly,separator=${FIELD})`, "--"]),
    git(repo, ["log", "--no-walk=unsorted", ...commits, `--format=tformat:${RECORD}%H`, "--numstat", "--diff-merges=first-parent", "--relative", "--", ".", ...CHURN_EXCLUDES]),
  ]);
  if (headers === null || stats === null) return null;
  const changedLines = new Map(parseFixStats(stats));
  const byFullHash = new Map(
    await Promise.all(
      parseFixHeaders(headers).map(async (header): Promise<[string, FixCommit]> => {
        const { lines, testLines, paths } = changedLines.get(header.full) ?? { lines: 0, testLines: 0, paths: [] };
        const landedAt = mainCommit === null ? undefined : await landingDate(git, repo, { fix: header, paths, mainCommit });
        return [header.full, { date: header.date, byAgent: header.byAgent, lines, testLines, ...(landedAt === undefined ? {} : { landedAt }) }];
      }),
    ),
  );
  return new Map(
    [...fullHashes].flatMap(([hash, full]): [string, FixCommit][] => {
      const commit = byFullHash.get(full);
      return commit === undefined ? [] : [[hash, commit]];
    }),
  );
}

function parseFixHeaders(output: string): FixHeader[] {
  return records(output).map((record) => {
    const [full = "", date = "", subject = "", ...trailers] = record.split("\n")[0]?.split(FIELD) ?? [];
    return { full, date, subject, byAgent: trailers.some((trailer) => AGENT_TRAILER.test(trailer.trim())) };
  });
}

async function landingDate(git: GitRunner, repo: string, { fix, paths, mainCommit }: LandingQuestion): Promise<string | undefined> {
  if (fix.full === mainCommit) return fix.date;
  const descendants = await git(repo, ["log", "--first-parent", "--ancestry-path", `--format=tformat:%P${FIELD}%cI`, `${fix.full}..${mainCommit}`, "--"]);
  const [parents = "", mergedAt = ""] = lastLine(descendants).split(FIELD);
  if (mergedAt !== "") return parents.split(" ")[0] === fix.full ? fix.date : mergedAt;
  if (fix.subject === "" || paths.length === 0) return undefined;
  const pathspecs = paths.map((path) => `:(literal)${path}`);
  const squashes = await git(repo, ["log", mainCommit, "--first-parent", `--since=${fix.date}`, "--extended-regexp", `--grep=${subjectLinePattern(fix.subject)}`, "--format=tformat:%cI", "--", ...pathspecs]);
  return lastLine(squashes) || undefined;
}

function subjectLinePattern(subject: string): string {
  const escaped = subject.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return `^[[:space:]]*([*-][[:space:]]+)?${escaped}([[:space:]]*\\(#[0-9]+\\))?[[:space:]]*$`;
}

function lastLine(output: string | null): string {
  return output?.trim().split("\n").at(-1) ?? "";
}

function parseFixStats(output: string): [string, FixChanges][] {
  return records(output).map((record): [string, FixChanges] => {
    const [full = "", ...rows] = record.split("\n");
    const paths = rows.map((row) => row.split("\t")[2] ?? "").filter((path) => path !== "" && !path.includes(RENAME_ARROW));
    return [full.trim(), { lines: numstatLines(rows), testLines: numstatLines(rows.filter((row) => isTestPath(row.split("\t")[2] ?? ""))), paths }];
  });
}

function records(output: string): string[] {
  return output.split(RECORD).filter((record) => record.trim() !== "");
}

function numstatLines(rows: readonly string[]): number {
  return sum(rows.filter((row) => row.trim() !== "").map(numstatRowLines).filter((lines) => !Number.isNaN(lines)));
}

function numstatRowLines(row: string): number {
  const [added = "", deleted = ""] = row.split("\t");
  return Number(added) + Number(deleted);
}

function parseLines(output: string, prefix: string): { path: string; lines: number }[] {
  return output
    .split("\n")
    .filter((record) => record.startsWith(prefix))
    .map((record) => {
      const [path = "", count = ""] = record.slice(prefix.length).split("\0");
      return { path, lines: Number(count) };
    });
}
