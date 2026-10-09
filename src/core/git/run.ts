import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { errorCode } from "../errors";
import { BYTES_PER_MEBIBYTE } from "../numbers";
import { createLimiter } from "./limit";

export type GitRunner = (repo: string, args: string[], input?: string) => Promise<string | null>;

export type GitOutcome = { status: "ok"; stdout: string } | { status: "exited"; exitCode: number; stderr: string } | { status: "unfinished" };

export type GitOutcomeRunner = (repo: string, args: string[], input?: string) => Promise<GitOutcome>;

export const RECORD = "\x1e";
export const FIELD = "\x1f";

const runFile = promisify(execFile);
const GIT_OUTPUT_LIMIT = 64 * BYTES_PER_MEBIBYTE;
const GREP_NO_MATCH_EXIT = 1;
const GIT_PROCESS_LIMIT = 8;

const gitProcessSlot = createLimiter(GIT_PROCESS_LIMIT);

export const runGitOutcome: GitOutcomeRunner = (repo, args, input) =>
  gitProcessSlot(async () => {
    try {
      const running = runFile("git", gitArgs(repo, args), { maxBuffer: GIT_OUTPUT_LIMIT });
      running.child.stdin?.on("error", ignoreStdinOfExitedGit).end(input);
      const { stdout } = await running;
      return { status: "ok", stdout };
    } catch (error) {
      const exitCode = errorCode(error);
      return typeof exitCode === "number" ? { status: "exited", exitCode, stderr: stderrOf(error) } : { status: "unfinished" };
    }
  });

export const runGit: GitRunner = async (repo, args, input) => {
  const outcome = await runGitOutcome(repo, args, input);
  return args[0] === "grep" && outcome.status === "exited" && outcome.exitCode === GREP_NO_MATCH_EXIT ? "" : stdoutOf(outcome);
};

export function stdoutOf(outcome: GitOutcome): string | null {
  return outcome.status === "ok" ? outcome.stdout : null;
}

export function outputLine(stdout: string | null): string | null {
  const line = stdout?.trim();
  return line === undefined || line === "" ? null : line;
}

export function literalPathspecs(paths: readonly string[]): string[] {
  return paths.map((path) => `:(literal)${path}`);
}

export function runGitSync(repo: string, args: string[]): string | null {
  try {
    return execFileSync("git", gitArgs(repo, args), { encoding: "utf8", maxBuffer: GIT_OUTPUT_LIMIT, stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

function gitArgs(repo: string, args: readonly string[]): string[] {
  return ["-C", repo, "--no-optional-locks", "-c", "core.quotePath=false", ...args];
}

export function resolveCommits(git: GitRunner, repo: string, revisions: readonly string[]): Promise<Map<string, string> | null> {
  return resolveObjects(git, repo, revisions, "commit");
}

export function resolveTrees(git: GitRunner, repo: string, revisions: readonly string[]): Promise<Map<string, string> | null> {
  return resolveObjects(git, repo, revisions, "tree");
}

async function resolveObjects(git: GitRunner, repo: string, revisions: readonly string[], type: "commit" | "tree"): Promise<Map<string, string> | null> {
  if (revisions.length === 0) return new Map();
  const output = await git(repo, ["cat-file", "--batch-check"], revisions.map((revision) => `${revision}^{${type}}\n`).join(""));
  if (output === null) return null;
  const lines = output.split("\n");
  return new Map(
    revisions.flatMap((revision, index): [string, string][] => {
      const [objectName = "", objectType] = lines[index]?.split(" ") ?? [];
      return objectType === type ? [[revision, objectName]] : [];
    }),
  );
}

function stderrOf(error: unknown): string {
  return typeof error === "object" && error !== null && "stderr" in error && typeof error.stderr === "string" ? error.stderr : "";
}

function ignoreStdinOfExitedGit(): undefined {
  return undefined;
}
