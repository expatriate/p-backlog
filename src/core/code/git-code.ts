import { FIELD, RECORD, resolveCommits, type GitRunner } from "../git/run";
import { sum } from "../numbers";
import type { CommitUnit, FileLines } from "./types";

const LOCK_FILES = ["package-lock.json", "yarn.lock", "pnpm-lock.yaml"];
const LOCK_EXCLUDES = LOCK_FILES.map((name) => `:!*${name}`);
const NON_CODE_EXTENSIONS = [".md", ".mdx", ".svg"];
export const CHURN_EXCLUDES = [...LOCK_EXCLUDES, ...NON_CODE_EXTENSIONS.map((ext) => `:!*${ext}`)];
const HEAD = "HEAD";
const MAIN_REFS = ["origin/HEAD", "main", "master"];

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

export async function readLines(git: GitRunner, repo: string, head: string): Promise<FileLines[] | null> {
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

export function records(output: string): string[] {
  return output.split(RECORD).filter((record) => record.trim() !== "");
}

export function numstatLines(rows: readonly string[]): number {
  return sum(
    rows
      .filter((row) => row.trim() !== "")
      .map(numstatRowLines)
      .filter((lines) => !Number.isNaN(lines)),
  );
}

function numstatRowLines(row: string): number {
  const [added = "", deleted = ""] = row.split("\t");
  return Number(added) + Number(deleted);
}

function parseLines(output: string, prefix: string): FileLines[] {
  return output
    .split("\n")
    .filter((record) => record.startsWith(prefix))
    .map((record) => {
      const [path = "", count = ""] = record.slice(prefix.length).split("\0");
      return { path, lines: Number(count) };
    });
}
