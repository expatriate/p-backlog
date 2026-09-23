import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { createLimiter } from "./limit";

export type GitRunner = (repo: string, args: string[], input?: string) => Promise<string | null>;

export const RECORD = "\x1e";
export const FIELD = "\x1f";

const runFile = promisify(execFile);
const GIT_OUTPUT_LIMIT = 64 * 1024 * 1024;
const GREP_NO_MATCH_EXIT = 1;
const GIT_PROCESS_LIMIT = 8;

const gitProcessSlot = createLimiter(GIT_PROCESS_LIMIT);

export const runGit: GitRunner = (repo, args, input) =>
  gitProcessSlot(async () => {
    try {
      const running = runFile("git", gitArgs(repo, args), { maxBuffer: GIT_OUTPUT_LIMIT });
      running.child.stdin?.on("error", ignoreStdinOfExitedGit).end(input);
      const { stdout } = await running;
      return stdout;
    } catch (error) {
      return args[0] === "grep" && exitCodeOf(error) === GREP_NO_MATCH_EXIT ? "" : null;
    }
  });

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

export async function resolveCommits(git: GitRunner, repo: string, revisions: readonly string[]): Promise<Map<string, string> | null> {
  if (revisions.length === 0) return new Map();
  const output = await git(repo, ["cat-file", "--batch-check"], revisions.map((revision) => `${revision}^{commit}\n`).join(""));
  if (output === null) return null;
  const lines = output.split("\n");
  return new Map(
    revisions.flatMap((revision, index): [string, string][] => {
      const [objectName = "", objectType] = lines[index]?.split(" ") ?? [];
      return objectType === "commit" ? [[revision, objectName]] : [];
    }),
  );
}

function ignoreStdinOfExitedGit(): undefined {
  return undefined;
}

function exitCodeOf(error: unknown): unknown {
  return typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
}
