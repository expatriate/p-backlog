import { access, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { FIELD, RECORD, runGit as git } from "../git/run";
import type { LineRange } from "./anchor";

export type FileChange = { path: string; renamedFrom?: string };

export type Commit = { sha: string; date: string; subject: string; files: FileChange[] };

export type RepoFacts = {
  isGit: boolean;
  commits: Commit[];
  dirtyModifiedAt: ReadonlyMap<string, number>;
  existing: ReadonlySet<string>;
  texts: ReadonlyMap<string, string>;
};

const DIFF_LINE_LIMIT = 80;

export async function collectRepoFacts(repo: string, { since, paths }: { since: Date; paths: readonly string[] }): Promise<RepoFacts> {
  const [log, status, existing] = await Promise.all([
    git(repo, ["log", `--since=${since.toISOString()}`, `--format=${RECORD}%h${FIELD}%cI${FIELD}%s`, "--name-status", "-M"]),
    git(repo, ["status", "--porcelain=v1", "-z", "--untracked-files=no"]),
    existingPaths(repo, paths),
  ]);
  const texts = await fileTexts(repo, [...existing]);
  if (log === null || status === null) return { isGit: false, commits: [], dirtyModifiedAt: new Map(), existing, texts };
  return { isGit: true, commits: parseLog(log), dirtyModifiedAt: await modificationTimes(repo, parseStatus(status)), existing, texts };
}

export async function diffSince(repo: string, path: string, since: Date): Promise<string | undefined> {
  const base = (await git(repo, ["rev-list", "-1", `--before=${since.toISOString()}`, "HEAD"]))?.trim();
  if (base === undefined || base === "") return undefined;
  const diff = await git(repo, ["diff", "--no-color", base, "--", path]);
  if (diff === null || diff.trim() === "") return undefined;
  const lines = diff.trimEnd().split("\n");
  if (lines.length <= DIFF_LINE_LIMIT) return lines.join("\n");
  return [...lines.slice(0, DIFF_LINE_LIMIT), `… ещё ${lines.length - DIFF_LINE_LIMIT} строк`].join("\n");
}

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm;

export async function changedLines(repo: string, path: string, since: Date): Promise<LineRange[] | null> {
  const base = (await git(repo, ["rev-list", "-1", `--before=${since.toISOString()}`, "HEAD"]))?.trim();
  if (base === undefined || base === "") return null;
  const diff = await git(repo, ["diff", "--unified=0", base, "--", path]);
  return diff === null ? null : hunkRanges(diff);
}

function hunkRanges(diff: string): LineRange[] {
  return [...diff.matchAll(HUNK_HEADER)].map((match) => {
    const start = Number(match[1]);
    const count = match[2] === undefined ? 1 : Number(match[2]);
    return count === 0 ? { from: start, to: start + 1 } : { from: start, to: start + count - 1 };
  });
}

async function fileTexts(repo: string, paths: readonly string[]): Promise<Map<string, string>> {
  const entries = await Promise.all(paths.map((path) => readFile(join(repo, path), "utf8").then((text): [string, string] => [path, text], () => null)));
  return new Map(entries.filter((entry) => entry !== null));
}

function parseLog(output: string): Commit[] {
  return output
    .split(RECORD)
    .filter((record) => record.trim() !== "")
    .map((record) => {
      const [header = "", ...lines] = record.split("\n");
      const [sha = "", date = "", subject = ""] = header.split(FIELD);
      return { sha, date, subject, files: lines.filter((line) => line.includes("\t")).map(parseNameStatus) };
    });
}

function parseNameStatus(line: string): FileChange {
  const [status = "", first = "", second] = line.split("\t");
  return /^[RC]/.test(status) && second !== undefined ? { path: second, renamedFrom: first } : { path: first };
}

function parseStatus(output: string): string[] {
  const entries = output.split("\0");
  const paths: string[] = [];
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index] ?? "";
    if (entry.length < 4) continue;
    paths.push(entry.slice(3));
    if (/^[RC]/.test(entry)) index++;
  }
  return paths;
}

async function modificationTimes(repo: string, paths: readonly string[]): Promise<Map<string, number>> {
  const entries = await Promise.all(
    paths.map((path) => stat(join(repo, path)).then((info): [string, number] => [path, info.mtimeMs], () => null)),
  );
  return new Map(entries.filter((entry) => entry !== null));
}

async function existingPaths(repo: string, paths: readonly string[]): Promise<Set<string>> {
  const found = await Promise.all(paths.map((path) => access(join(repo, path)).then(() => path, () => null)));
  return new Set(found.filter((path) => path !== null));
}
