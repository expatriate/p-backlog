import { access, readFile, stat } from "node:fs/promises";
import { isAbsolute, join, normalize, sep } from "node:path";
import { FIELD, RECORD, runGit, type GitRunner } from "../git/run";
import type { LineRange } from "./anchor";
import { changedRanges, parseHunks, type Hunk } from "./diff-hunks";
import { remembered } from "../remembered";

type FileChange = { path: string; renamedFrom?: string };

export type Commit = { sha: string; date: string; parents: string[]; subject: string; files: FileChange[] };

export type GitHistory = "read" | "not-a-repo" | "unreadable";

export type RepoFacts = {
  history: GitHistory;
  commits: Commit[];
  renames: Commit[];
  dirtyModifiedAt: ReadonlyMap<string, number>;
  removedInWorktree: ReadonlySet<string>;
  inHistory: ReadonlySet<string>;
  existing: ReadonlySet<string>;
  texts: ReadonlyMap<string, string>;
};

const DIFF_LINE_LIMIT = 80;
const REFLOG_MOMENT = /\{(\d+)\}$/;
const MS_PER_SECOND = 1000;
const STATUS_CODE_WIDTH = 3;

export type PathMarks = ReadonlyMap<string, number>;

export async function collectRepoFacts(repo: string, pathMarks: PathMarks): Promise<RepoFacts> {
  const paths = [...pathMarks.keys()];
  const [prefix, existing] = await Promise.all([runGit(repo, ["rev-parse", "--show-prefix"]), existingPaths(repo, paths)]);
  const texts = await fileTexts(repo, [...existing]);
  const withoutHistory = (history: GitHistory): RepoFacts => ({ history, commits: [], renames: [], dirtyModifiedAt: new Map(), removedInWorktree: new Set(), inHistory: new Set(), existing, texts });
  if (prefix === null) return withoutHistory("not-a-repo");
  const missing = paths.filter((path) => !existing.has(path));
  const [log, renames, status, inHistory] = await Promise.all([
    pathLog(repo, earliestMark(pathMarks, paths), paths),
    missing.length === 0 ? "" : runGit(repo, [...logArgs(earliestMark(pathMarks, missing)), "--diff-filter=R"]),
    runGit(repo, ["status", "--porcelain=v1", "-z", "--untracked-files=no"]),
    committedPaths(repo, missing),
  ]);
  if (log === null || renames === null || status === null || inHistory === null) return withoutHistory("unreadable");
  const worktree = parseStatus(status);
  const inRepo = (gitRootPaths: readonly string[]) => withinRepo(gitRootPaths, prefix.trim());
  return {
    history: "read",
    commits: parseLog(log),
    renames: parseLog(renames),
    dirtyModifiedAt: await modificationTimes(repo, inRepo(worktree.changed)),
    removedInWorktree: new Set(inRepo(worktree.removed)),
    inHistory: new Set(inHistory),
    existing,
    texts,
  };
}

function earliestMark(marks: PathMarks, paths: readonly string[]): Date {
  return new Date(Math.min(...paths.flatMap((path) => marks.get(path) ?? [])));
}

function logArgs(since: Date): string[] {
  return ["log", "--relative", `--since=${since.toISOString()}`, `--format=${RECORD}%h${FIELD}%cI${FIELD}%p${FIELD}%s`, "--name-status", "-M", "--diff-merges=first-parent", "-z"];
}

async function pathLog(repo: string, since: Date, paths: readonly string[]): Promise<string | null> {
  const inside = paths.filter(isInsideRepo);
  if (inside.length === 0) return "";
  return runGit(repo, [...logArgs(since), "--", ...literalPathspecs(inside)]);
}

async function committedPaths(repo: string, paths: readonly string[]): Promise<string[] | null> {
  const inside = paths.filter(isInsideRepo);
  if (inside.length === 0) return [];
  const names = await runGit(repo, ["log", "--all", "--relative", "--format=", "--name-only", "-z", "--", ...literalPathspecs(inside)]);
  return names === null ? null : names.split(/[\0\n]/).filter((name) => name !== "");
}

function literalPathspecs(paths: readonly string[]): string[] {
  return paths.map((path) => `:(literal)${path}`);
}

function isInsideRepo(path: string): boolean {
  const normalized = normalize(path);
  return normalized !== "." && !isAbsolute(normalized) && normalized !== ".." && !normalized.startsWith(`..${sep}`);
}

export type DiffExcerpt = { text: string; omittedLines: number };

type FileDiff = { excerpt: DiffExcerpt | undefined; changed: LineRange[]; hunks: Hunk[] | null };

export type DiffSince = (path: string, since: Date) => Promise<FileDiff | null>;

export type DiffFrom = (path: string, commit: string) => Promise<FileDiff | null>;

export function diffsSince(repo: string, git: GitRunner = runGit, diffFrom: DiffFrom = diffsFrom(repo, git)): DiffSince {
  const bases = new Map<number, Promise<string | null>>();
  const baseBefore = (since: Date): Promise<string | null> =>
    remembered(bases, since.getTime(), async () => {
      const base = (await git(repo, ["rev-list", "-1", "--first-parent", `--before=${since.toISOString()}`, "HEAD"]))?.trim() ?? "";
      return base === "" ? null : base;
    });
  return async (path, since) => {
    const base = await baseBefore(since);
    return base === null ? null : diffFrom(path, base);
  };
}

export type HeadAt = (moment: Date) => Promise<{ commit: string; onThisLine: boolean } | null>;

type HeadMove = { commit: string; at: number };

export function headsAt(repo: string, git: GitRunner = runGit): HeadAt {
  let moves: Promise<HeadMove[]> | null = null;
  const ancestors = new Map<string, Promise<boolean>>();
  return async (moment) => {
    moves ??= headMovesNewestFirst(repo, git);
    const commit = (await moves).find((move) => move.at <= moment.getTime())?.commit;
    if (commit === undefined) return null;
    const onThisLine = await remembered(ancestors, commit, async () => (await git(repo, ["merge-base", "--is-ancestor", commit, "HEAD"])) !== null);
    return { commit, onThisLine };
  };
}

async function headMovesNewestFirst(repo: string, git: GitRunner): Promise<HeadMove[]> {
  const reflog = await git(repo, ["log", "--walk-reflogs", "--date=unix", `--format=%H${FIELD}%gd`, "HEAD"]);
  return (reflog ?? "").split("\n").flatMap((line): HeadMove[] => {
    const [commit = "", selector = ""] = line.split(FIELD);
    const seconds = REFLOG_MOMENT.exec(selector)?.[1];
    return seconds === undefined ? [] : [{ commit, at: Number(seconds) * MS_PER_SECOND }];
  });
}

export function diffsFrom(repo: string, git: GitRunner = runGit): DiffFrom {
  const diffs = new Map<string, Promise<FileDiff | null>>();
  return (path, commit) =>
    remembered(diffs, `${commit} ${path}`, async () => {
      const diff = await git(repo, ["-c", "diff.suppressBlankEmpty=false", "diff", "--no-color", "--no-ext-diff", "--no-textconv", commit, "--", path]);
      if (diff === null) return null;
      const hunks = parseHunks(diff);
      return { excerpt: excerptOf(diff), changed: changedRanges(hunks ?? []), hunks };
    });
}

function excerptOf(diff: string): DiffExcerpt | undefined {
  if (diff.trim() === "") return undefined;
  const lines = diff.trimEnd().split("\n");
  return { text: lines.slice(0, DIFF_LINE_LIMIT).join("\n"), omittedLines: Math.max(0, lines.length - DIFF_LINE_LIMIT) };
}

async function fileTexts(repo: string, paths: readonly string[]): Promise<Map<string, string>> {
  const entries = await Promise.all(
    paths.map((path) =>
      readFile(join(repo, path), "utf8").then(
        (text): [string, string] => [path, text],
        () => null,
      ),
    ),
  );
  return new Map(entries.filter((entry) => entry !== null));
}

function parseLog(output: string): Commit[] {
  return output
    .split(RECORD)
    .filter((record) => record.trim() !== "")
    .map((record) => {
      const headerEnd = record.includes("\0") ? record.indexOf("\0") : record.length;
      const [sha = "", date = "", parents = "", subject = ""] = record.slice(0, headerEnd).trim().split(FIELD);
      return {
        sha,
        date,
        parents: parents.split(" ").filter((parent) => parent !== ""),
        subject,
        files: parseNameStatus(
          record
            .slice(headerEnd + 1)
            .replace(/^\n/, "")
            .split("\0"),
        ),
      };
    });
}

function parseNameStatus(tokens: readonly string[]): FileChange[] {
  const files: FileChange[] = [];
  for (let index = 0; index < tokens.length;) {
    const status = tokens[index] ?? "";
    const first = tokens[index + 1] ?? "";
    if (status === "" || first === "") break;
    if (/^[RC]/.test(status)) {
      files.push({ path: tokens[index + 2] ?? first, renamedFrom: first });
      index += 3;
    } else {
      files.push({ path: first });
      index += 2;
    }
  }
  return files;
}

type WorktreeStatus = { changed: string[]; removed: string[] };

function parseStatus(output: string): WorktreeStatus {
  const entries = output.split("\0");
  const status: WorktreeStatus = { changed: [], removed: [] };
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index] ?? "";
    if (entry.length <= STATUS_CODE_WIDTH) continue;
    const path = entry.slice(STATUS_CODE_WIDTH);
    status.changed.push(path);
    if (/^(?:D.|.D)/.test(entry)) status.removed.push(path);
    if (/^(?:R.|.R)/.test(entry)) status.removed.push(entries[index + 1] ?? "");
    if (/^(?:[RC].|.[RC])/.test(entry)) index++;
  }
  return status;
}

function withinRepo(gitRootPaths: readonly string[], prefix: string): string[] {
  return gitRootPaths.filter((path) => path.startsWith(prefix)).map((path) => path.slice(prefix.length));
}

async function modificationTimes(repo: string, paths: readonly string[]): Promise<Map<string, number>> {
  const entries = await Promise.all(
    paths.map((path) =>
      stat(join(repo, path)).then(
        (info): [string, number] => [path, info.mtimeMs],
        () => null,
      ),
    ),
  );
  return new Map(entries.filter((entry) => entry !== null));
}

async function existingPaths(repo: string, paths: readonly string[]): Promise<Set<string>> {
  const found = await Promise.all(
    paths.map((path) =>
      access(join(repo, path)).then(
        () => path,
        () => null,
      ),
    ),
  );
  return new Set(found.filter((path) => path !== null));
}
