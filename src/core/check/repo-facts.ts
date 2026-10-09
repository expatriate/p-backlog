import { isAbsolute, join, normalize, sep } from "node:path";
import { FIELD, literalPathspecs, outputLine, RECORD, runGit, runGitOutcome, type GitRunner } from "../git/run";
import type { LineRange } from "./anchor";
import { changedRanges, parseHunks, type Hunk } from "./diff-hunks";
import { SECOND_MS } from "../model/dates";
import { remembered } from "../remembered";
import { fileExists, lstatOrNull, readReportingFailure, readTextIfFile } from "../store/fs-utils";

type FileChange = { path: string; renamedFrom?: string };

export type Commit = { sha: string; date: string; parents: string[]; subject: string; files: FileChange[] };

export type GitHistory = "read" | "not-a-repo" | "unreadable";

export type RepoFacts = {
  history: GitHistory;
  commits: Commit[];
  renames: Commit[];
  dirtyModifiedAt: ReadonlyMap<string, number>;
  committedHere: ReadonlySet<string>;
  committedAnywhere: ReadonlySet<string>;
  existing: ReadonlySet<string>;
  texts: ReadonlyMap<string, string>;
  unreadable: ReadonlyMap<string, unknown>;
};

const DIFF_LINE_LIMIT = 80;
const REFLOG_MOMENT = /\{(\d+)\}$/;
const STATUS_CODE_WIDTH = 3;
const RENAME_OR_COPY = /^[RC]/;
const ORIGINAL_PATH_FOLLOWS = /^(?:[RC].|.[RC])/;

export type PathMarks = ReadonlyMap<string, number>;

export async function collectRepoFacts(repo: string, pathMarks: PathMarks): Promise<RepoFacts> {
  const paths = [...pathMarks.keys()];
  const [location, files] = await Promise.all([runGitOutcome(repo, ["rev-parse", "--show-prefix", "--revs-only", "HEAD"]), sourceFiles(repo, paths)]);
  const withoutHistory = (history: GitHistory): RepoFacts => ({ history, commits: [], renames: [], dirtyModifiedAt: new Map(), ...UNKNOWN_BRANCH_HISTORY, ...files });
  if (location.status === "exited") return withoutHistory("not-a-repo");
  if (location.status === "unfinished") return withoutHistory("unreadable");
  const [prefix = "", head = ""] = location.stdout.split("\n").map((line) => line.trim());
  const hasCommits = head !== "";
  const missing = paths.filter((path) => !files.existing.has(path) && !files.unreadable.has(path));
  const [log, renames, status, branchHistory] = await Promise.all([
    hasCommits ? pathLog(repo, earliestMark(pathMarks, paths), paths) : "",
    hasCommits && missing.length > 0 ? runGit(repo, [...logArgs(earliestMark(pathMarks, missing)), "--diff-filter=R"]) : "",
    runGit(repo, ["status", "--porcelain=v1", "-z", "--untracked-files=no"]),
    branchHistoryOf(repo, missing),
  ]);
  if (log === null || renames === null || status === null) return withoutHistory("unreadable");
  const dirty = withinRepo(parseStatus(status), prefix);
  return { history: "read", commits: parseLog(log), renames: parseLog(renames), dirtyModifiedAt: await modificationTimes(repo, dirty), ...branchHistory, ...files };
}

type BranchHistory = Pick<RepoFacts, "committedHere" | "committedAnywhere">;

const UNKNOWN_BRANCH_HISTORY: BranchHistory = { committedHere: new Set(), committedAnywhere: new Set() };

async function branchHistoryOf(repo: string, paths: readonly string[]): Promise<BranchHistory> {
  const [here, anywhere] = await Promise.all([committedPaths(repo, "HEAD", paths), committedPaths(repo, "--all", paths)]);
  return here === null || anywhere === null ? UNKNOWN_BRANCH_HISTORY : { committedHere: new Set(here), committedAnywhere: new Set(anywhere) };
}

function earliestMark(marks: PathMarks, paths: readonly string[]): Date {
  return new Date(Math.min(...paths.flatMap((path) => marks.get(path) ?? [])));
}

function logArgs(since: Date): string[] {
  return ["log", "--relative", `--since=${since.toISOString()}`, `--format=${RECORD}%h${FIELD}%cI${FIELD}%p${FIELD}%s`, "--name-status", "-M", "--diff-merges=first-parent", "--full-history", "-z"];
}

async function pathLog(repo: string, since: Date, paths: readonly string[]): Promise<string | null> {
  const inside = paths.filter(isInsideRepo);
  if (inside.length === 0) return "";
  return runGit(repo, [...logArgs(since), "--", ...literalPathspecs(inside)]);
}

async function committedPaths(repo: string, revisions: string, paths: readonly string[]): Promise<string[] | null> {
  const inside = paths.filter(isInsideRepo);
  if (inside.length === 0) return [];
  const names = await runGit(repo, ["log", revisions, "--relative", "--format=", "--name-only", "-z", "--", ...literalPathspecs(inside)]);
  return names === null ? null : names.split(/[\0\n]/).filter((name) => name !== "");
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
    remembered(bases, since.getTime(), async () => outputLine(await git(repo, ["rev-list", "-1", "--first-parent", `--before=${since.toISOString()}`, "HEAD"])));
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
    return seconds === undefined ? [] : [{ commit, at: Number(seconds) * SECOND_MS }];
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

type SourceFiles = Pick<RepoFacts, "existing" | "texts" | "unreadable">;

type SourceFile = { kind: "missing"; path: string } | { kind: "present"; path: string; text: string | null };

async function sourceFiles(repo: string, paths: readonly string[]): Promise<SourceFiles> {
  const unreadable = new Map<string, unknown>();
  const recordUnreadable = (path: string, error: unknown) => {
    unreadable.set(path, error);
  };
  const read = await Promise.all(paths.map((path) => readReportingFailure(path, (relative) => sourceFile(repo, relative), recordUnreadable)));
  const present = read.flatMap((file) => (file?.kind === "present" ? [file] : []));
  return {
    existing: new Set(present.map((file) => file.path)),
    texts: new Map(present.flatMap((file): [string, string][] => (file.text === null ? [] : [[file.path, file.text]]))),
    unreadable,
  };
}

async function sourceFile(repo: string, path: string): Promise<SourceFile> {
  const absolute = join(repo, path);
  if (!(await fileExists(absolute))) return { kind: "missing", path };
  return { kind: "present", path, text: await readTextIfFile(absolute) };
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
    if (RENAME_OR_COPY.test(status)) {
      files.push({ path: tokens[index + 2] ?? first, renamedFrom: first });
      index += 3;
    } else {
      files.push({ path: first });
      index += 2;
    }
  }
  return files;
}

function parseStatus(output: string): string[] {
  const entries = output.split("\0");
  const paths: string[] = [];
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index] ?? "";
    if (entry.length <= STATUS_CODE_WIDTH) continue;
    paths.push(entry.slice(STATUS_CODE_WIDTH));
    if (ORIGINAL_PATH_FOLLOWS.test(entry)) index++;
  }
  return paths;
}

function withinRepo(gitRootPaths: readonly string[], prefix: string): string[] {
  return gitRootPaths.filter((path) => path.startsWith(prefix)).map((path) => path.slice(prefix.length));
}

async function modificationTimes(repo: string, paths: readonly string[]): Promise<Map<string, number>> {
  const entries = await Promise.all(
    paths.map(async (path): Promise<[string, number][]> => {
      const info = await lstatOrNull(join(repo, path));
      return info === null ? [] : [[path, info.mtimeMs]];
    }),
  );
  return new Map(entries.flat());
}
