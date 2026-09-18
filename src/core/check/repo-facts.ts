import { execFile } from "node:child_process";
import { access, stat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

export type FileChange = { path: string; renamedFrom?: string };

export type Commit = { sha: string; date: string; subject: string; files: FileChange[] };

export type RepoFacts = {
  isGit: boolean;
  commits: Commit[];
  dirtyModifiedAt: ReadonlyMap<string, number>;
  existing: ReadonlySet<string>;
};

const runFile = promisify(execFile);
const RECORD = "\x1e";
const FIELD = "\x1f";
const GIT_OUTPUT_LIMIT = 64 * 1024 * 1024;

export async function collectRepoFacts(repo: string, { since, paths }: { since: Date; paths: readonly string[] }): Promise<RepoFacts> {
  const [log, status, existing] = await Promise.all([
    git(repo, ["log", `--since=${since.toISOString()}`, `--format=${RECORD}%h${FIELD}%cI${FIELD}%s`, "--name-status", "-M"]),
    git(repo, ["status", "--porcelain=v1", "-z", "--untracked-files=no"]),
    existingPaths(repo, paths),
  ]);
  if (log === null || status === null) return { isGit: false, commits: [], dirtyModifiedAt: new Map(), existing };
  return { isGit: true, commits: parseLog(log), dirtyModifiedAt: await modificationTimes(repo, parseStatus(status)), existing };
}

async function git(repo: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await runFile("git", ["-C", repo, "--no-optional-locks", "-c", "core.quotePath=false", ...args], { maxBuffer: GIT_OUTPUT_LIMIT });
    return stdout;
  } catch {
    return null;
  }
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
