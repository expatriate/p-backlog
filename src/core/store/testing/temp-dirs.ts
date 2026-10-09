import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { onTestFinished } from "vitest";

export async function makeTempDir(): Promise<string> {
  const dir = await realpath(await mkdtemp(join(tmpdir(), "backlog-test-")));
  onTestFinished(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

export const ISOLATED_GIT_ENV = { GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" } as const;

export async function makeGitRepo(parent: string, name: string): Promise<string> {
  const dir = join(parent, name);
  await mkdir(dir, { recursive: true });
  execFileSync("git", ["init", "-q", "-b", "master"], { cwd: dir });
  return dir;
}

const TEST_COMMITTER = ["-c", "user.name=backlog-test", "-c", "user.email=test@backlog.local", "-c", "commit.gpgsign=false"];

export function gitCommitAll(repo: string, message: string, isoDate: string): void {
  const env = { ...process.env, GIT_AUTHOR_DATE: isoDate, GIT_COMMITTER_DATE: isoDate };
  execFileSync("git", ["add", "-A"], { cwd: repo, env });
  execFileSync("git", [...TEST_COMMITTER, "commit", "-q", "-m", message], { cwd: repo, env });
}

export function gitMergeNoFastForward(repo: string, branch: string, isoDate: string): void {
  const env = { ...process.env, GIT_AUTHOR_DATE: isoDate, GIT_COMMITTER_DATE: isoDate };
  execFileSync("git", [...TEST_COMMITTER, "merge", "-q", "--no-ff", "-m", `Слить ${branch}`, branch], { cwd: repo, env });
}

export function gitMergeSquash(repo: string, branch: string): void {
  execFileSync("git", [...TEST_COMMITTER, "merge", "--squash", "-q", branch], { cwd: repo, stdio: "pipe" });
}

export function gitRebase(repo: string, onto: string, isoDate: string): void {
  execFileSync("git", [...TEST_COMMITTER, "rebase", "-q", onto], { cwd: repo, stdio: "pipe", env: { ...process.env, GIT_COMMITTER_DATE: isoDate } });
}

export function gitRebaseMerge(repo: string, branch: string, isoDate: string): void {
  execFileSync("git", [...TEST_COMMITTER, "cherry-pick", `HEAD..${branch}`], { cwd: repo, env: { ...process.env, GIT_COMMITTER_DATE: isoDate } });
}

export function gitCheckout(repo: string, branch: string, { create = false, at }: { create?: boolean; at?: string } = {}): void {
  execFileSync("git", ["checkout", "-q", ...(create ? ["-b"] : []), branch], { cwd: repo, env: at === undefined ? process.env : { ...process.env, GIT_COMMITTER_DATE: at } });
}

export function gitMergeFastForward(repo: string, branch: string, isoDate: string): void {
  execFileSync("git", ["merge", "-q", "--ff-only", branch], { cwd: repo, env: { ...process.env, GIT_COMMITTER_DATE: isoDate } });
}

export function gitAddWorktree(repo: string, path: string, branch: string): void {
  execFileSync("git", ["worktree", "add", "-q", "-b", branch, path], { cwd: repo });
}

export async function writeFiles(root: string, files: Record<string, string>): Promise<void> {
  for (const [relativePath, content] of Object.entries(files)) {
    const path = join(root, relativePath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, "utf8");
  }
}

export function projectFile(prefix: string, repos: string[] = [], { active = true }: { active?: boolean } = {}): string {
  const activeLine = active ? "" : "active: false\n";
  return `---\nname: ${prefix.toLowerCase()}\nprefix: ${prefix}\nrepos: [${repos.join(", ")}]\n${activeLine}---\n`;
}

export function taskFile(id: string, fields: string | Record<string, string> = "", body = ""): string {
  const overrides = typeof fields === "string" ? {} : fields;
  const rawLines = typeof fields === "string" ? fields : "";
  const frontmatter = { id, title: `Задача ${id}`, created: "2026-09-17T10:00:00+03:00", ...overrides };
  const lines = Object.entries(frontmatter).map(([key, value]) => `${key}: ${value}\n`);
  return `---\n${lines.join("")}${rawLines}---\n${body === "" ? "" : `\n${body}\n`}`;
}
