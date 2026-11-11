import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { errorCode } from "../errors";
import { BYTES_PER_MEBIBYTE } from "../numbers";
import { createLimiter } from "./limit";

export type GitRunner = (repo: string, args: string[], input?: string) => Promise<string | null>;

export type GitOutcome = { status: "ok"; stdout: string } | { status: "exited"; exitCode: number; stderr: string } | { status: "unfinished" };

export type GitOutcomeRunner = (repo: string, args: string[], input?: string) => Promise<GitOutcome>;

export const PARSED_DIFF_OPTIONS = ["--no-color", "--no-ext-diff", "--no-textconv"] as const;

export const RECORD = "\x1e";
export const FIELD = "\x1f";

const runFile = promisify(execFile);
const GIT_OUTPUT_LIMIT = 64 * BYTES_PER_MEBIBYTE;
const GREP_NO_MATCH_EXIT = 1;
const GIT_PROCESS_LIMIT = 8;
const FULL_OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const FOUND_OBJECT_FIELDS = 3;

const REPOSITORY_BOUND_ENV: ReadonlySet<string> = new Set([
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_IMPLICIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_COMMON_DIR",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_SHALLOW_FILE",
  "GIT_GRAFT_FILE",
  "GIT_NO_REPLACE_OBJECTS",
  "GIT_REPLACE_REF_BASE",
  "GIT_NAMESPACE",
  "GIT_PREFIX",
]);

const gitProcessSlot = createLimiter(GIT_PROCESS_LIMIT);

export const runGitOutcome: GitOutcomeRunner = (repo, args, input) =>
  gitProcessSlot(async () => {
    try {
      const running = runFile("git", gitArgs(repo, args), { maxBuffer: GIT_OUTPUT_LIMIT, env: envForRepoGit() });
      running.child.stdin?.on("error", ignoreStdinOfExitedGit).end(input);
      const { stdout } = await running;
      return { status: "ok", stdout };
    } catch (error) {
      const exitCode = errorCode(error);
      return typeof exitCode === "number" ? { status: "exited", exitCode, stderr: stderrOf(error) } : { status: "unfinished" };
    }
  });

export function asGitRunner(git: GitOutcomeRunner): GitRunner {
  return async (repo, args, input) => {
    const outcome = await git(repo, args, input);
    return args[0] === "grep" && outcome.status === "exited" && outcome.exitCode === GREP_NO_MATCH_EXIT ? "" : stdoutOf(outcome);
  };
}

export const runGit: GitRunner = asGitRunner(runGitOutcome);

export function stdoutOf(outcome: GitOutcome): string | null {
  return outcome.status === "ok" ? outcome.stdout : null;
}

export function outputLine(stdout: string | null): string | null {
  const line = stdout?.trim();
  return line === undefined || line === "" ? null : line;
}

declare const commitHashBrand: unique symbol;

export type CommitHash = string & { readonly [commitHashBrand]: true };

export function commitHashOf(line: string | null): CommitHash | null {
  return line !== null && FULL_OBJECT_ID.test(line) ? (line as CommitHash) : null;
}

export function outputLines(stdout: string | null): string[] | null {
  return stdout?.split("\n").filter((line) => line !== "") ?? null;
}

export function literalPathspecs(paths: readonly string[]): string[] {
  return paths.map((path) => `:(literal)${path}`);
}

export function topLiteralPathspecs(paths: readonly string[]): string[] {
  return paths.map((path) => `:(top,literal)${path}`);
}

export function runGitSync(repo: string, args: string[]): string | null {
  try {
    return execFileSync("git", gitArgs(repo, args), { encoding: "utf8", maxBuffer: GIT_OUTPUT_LIMIT, stdio: ["ignore", "pipe", "ignore"], env: envForRepoGit() });
  } catch (error) {
    if (isChildProcessFailure(error)) return null;
    throw error;
  }
}

function isChildProcessFailure(error: unknown): boolean {
  return typeof error === "object" && error !== null && "status" in error;
}

function envForRepoGit(): NodeJS.ProcessEnv {
  // eslint-disable-next-line no-restricted-properties -- git inherits the user's environment, but the variables git sets for a hook's repository must not override -C <repo>
  return Object.fromEntries(Object.entries(process.env).filter(([name]) => !REPOSITORY_BOUND_ENV.has(name)));
}

function gitArgs(repo: string, args: readonly string[]): string[] {
  return ["-C", repo, "--no-optional-locks", "--no-literal-pathspecs", "-c", "core.quotePath=false", "-c", "diff.suppressBlankEmpty=false", ...args];
}

export async function objectIds(git: GitRunner, repo: string, objectNames: readonly string[]): Promise<Map<string, string> | null> {
  const names = [...new Set(objectNames)];
  if (names.length === 0) return new Map();
  if (names.some((name) => name.includes("\n"))) return null;
  const output = await git(repo, ["cat-file", "--batch-check"], names.map((name) => `${name}\n`).join(""));
  if (output === null) return null;
  const lines = output.split("\n");
  return new Map(
    names.flatMap((name, index): [string, string][] => {
      const fields = lines[index]?.split(" ") ?? [];
      const id = fields[0] ?? "";
      return fields.length === FOUND_OBJECT_FIELDS && FULL_OBJECT_ID.test(id) ? [[name, id]] : [];
    }),
  );
}

export function resolveCommits(git: GitRunner, repo: string, revisions: readonly string[]): Promise<Map<string, CommitHash> | null> {
  return resolveObjects(git, repo, revisions, "commit", commitHashOf);
}

export function resolveTrees(git: GitRunner, repo: string, revisions: readonly string[]): Promise<Map<string, string> | null> {
  return resolveObjects(git, repo, revisions, "tree", (objectName) => objectName);
}

async function resolveObjects<T>(git: GitRunner, repo: string, revisions: readonly string[], type: "commit" | "tree", nameOf: (objectName: string) => T | null): Promise<Map<string, T> | null> {
  const peeled = (revision: string) => `${revision}^{${type}}`;
  const ids = await objectIds(git, repo, revisions.map(peeled));
  if (ids === null) return null;
  return new Map(
    revisions.flatMap((revision): [string, T][] => {
      const id = ids.get(peeled(revision));
      const name = id === undefined ? null : nameOf(id);
      return name === null ? [] : [[revision, name]];
    }),
  );
}

function stderrOf(error: unknown): string {
  return typeof error === "object" && error !== null && "stderr" in error && typeof error.stderr === "string" ? error.stderr : "";
}

function ignoreStdinOfExitedGit(): undefined {
  return undefined;
}
