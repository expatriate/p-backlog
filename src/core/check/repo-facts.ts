import { access, readFile, stat } from "node:fs/promises";
import { isAbsolute, join, normalize, sep } from "node:path";
import { FIELD, RECORD, runGit, type GitRunner } from "../git/run";
import type { LineRange } from "./anchor";
import { changedRanges, parseHunks, type Hunk } from "./diff-hunks";

type FileChange = { path: string; renamedFrom?: string };

export type Commit = { sha: string; date: string; subject: string; files: FileChange[] };

export type GitHistory = "read" | "not-a-repo" | "unreadable";

export type RepoFacts = {
  history: GitHistory;
  commits: Commit[];
  renames: Commit[];
  dirtyModifiedAt: ReadonlyMap<string, number>;
  existing: ReadonlySet<string>;
  texts: ReadonlyMap<string, string>;
};

const DIFF_LINE_LIMIT = 80;

export async function collectRepoFacts(repo: string, { since, paths }: { since: Date; paths: readonly string[] }): Promise<RepoFacts> {
  const [prefix, existing] = await Promise.all([runGit(repo, ["rev-parse", "--show-prefix"]), existingPaths(repo, paths)]);
  const texts = await fileTexts(repo, [...existing]);
  const withoutHistory = (history: GitHistory): RepoFacts => ({ history, commits: [], renames: [], dirtyModifiedAt: new Map(), existing, texts });
  if (prefix === null) return withoutHistory("not-a-repo");
  const missing = paths.filter((path) => !existing.has(path));
  const [log, renames, status] = await Promise.all([
    pathLog(repo, since, paths),
    missing.length === 0 ? "" : runGit(repo, [...logArgs(since), "--diff-filter=R"]),
    runGit(repo, ["status", "--porcelain=v1", "-z", "--untracked-files=no"]),
  ]);
  if (log === null || renames === null || status === null) return withoutHistory("unreadable");
  const dirty = withinRepo(parseStatus(status), prefix.trim());
  return { history: "read", commits: parseLog(log), renames: parseLog(renames), dirtyModifiedAt: await modificationTimes(repo, dirty), existing, texts };
}

function logArgs(since: Date): string[] {
  return ["log", "--relative", `--since=${since.toISOString()}`, `--format=${RECORD}%h${FIELD}%cI${FIELD}%s`, "--name-status", "-M", "--diff-merges=first-parent", "-z"];
}

async function pathLog(repo: string, since: Date, paths: readonly string[]): Promise<string | null> {
  const inside = paths.filter(isInsideRepo);
  if (inside.length === 0) return "";
  return runGit(repo, [...logArgs(since), "--", ...inside.map((path) => `:(literal)${path}`)]);
}

function isInsideRepo(path: string): boolean {
  const normalized = normalize(path);
  return normalized !== "." && !isAbsolute(normalized) && normalized !== ".." && !normalized.startsWith(`..${sep}`);
}

export type DiffExcerpt = { text: string; omittedLines: number };

type FileDiff = { excerpt: DiffExcerpt | undefined; changed: LineRange[]; hunks: Hunk[] | null };

export type DiffSince = (path: string, since: Date) => Promise<FileDiff | null>;

export function diffsSince(repo: string, git: GitRunner = runGit): DiffSince {
  const bases = new Map<number, Promise<string | null>>();
  const diffs = new Map<string, Promise<FileDiff | null>>();
  const baseBefore = (since: Date): Promise<string | null> =>
    remembered(bases, since.getTime(), async () => {
      const base = (await git(repo, ["rev-list", "-1", "--first-parent", `--before=${since.toISOString()}`, "HEAD"]))?.trim() ?? "";
      return base === "" ? null : base;
    });
  return (path, since) =>
    remembered(diffs, `${since.getTime()} ${path}`, async () => {
      const base = await baseBefore(since);
      const diff = base === null ? null : await git(repo, ["-c", "diff.suppressBlankEmpty=false", "diff", "--no-color", "--no-ext-diff", "--no-textconv", base, "--", path]);
      if (diff === null) return null;
      const hunks = parseHunks(diff);
      return { excerpt: excerptOf(diff), changed: changedRanges(hunks ?? []), hunks };
    });
}

function remembered<K, V>(cache: Map<K, Promise<V>>, key: K, read: () => Promise<V>): Promise<V> {
  const known = cache.get(key);
  if (known !== undefined) return known;
  const reading = read();
  cache.set(key, reading);
  return reading;
}

function excerptOf(diff: string): DiffExcerpt | undefined {
  if (diff.trim() === "") return undefined;
  const lines = diff.trimEnd().split("\n");
  return { text: lines.slice(0, DIFF_LINE_LIMIT).join("\n"), omittedLines: Math.max(0, lines.length - DIFF_LINE_LIMIT) };
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
      const headerEnd = record.includes("\0") ? record.indexOf("\0") : record.length;
      const [sha = "", date = "", subject = ""] = record.slice(0, headerEnd).trim().split(FIELD);
      return { sha, date, subject, files: parseNameStatus(record.slice(headerEnd + 1).replace(/^\n/, "").split("\0")) };
    });
}

function parseNameStatus(tokens: readonly string[]): FileChange[] {
  const files: FileChange[] = [];
  for (let index = 0; index < tokens.length; ) {
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

function parseStatus(output: string): string[] {
  const entries = output.split("\0");
  const paths: string[] = [];
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index] ?? "";
    if (entry.length < 4) continue;
    paths.push(entry.slice(3));
    if (/^(?:[RC].|.[RC])/.test(entry)) index++;
  }
  return paths;
}

function withinRepo(gitRootPaths: readonly string[], prefix: string): string[] {
  return gitRootPaths.filter((path) => path.startsWith(prefix)).map((path) => path.slice(prefix.length));
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
