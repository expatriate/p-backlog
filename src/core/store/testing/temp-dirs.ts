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
  execFileSync("git", ["init", "-q", "-b", "master"], { cwd: dir, env: { ...process.env, ...ISOLATED_GIT_ENV } });
  return dir;
}

export function gitCommitAll(repo: string, message: string, isoDate: string): void {
  const env = { ...process.env, ...ISOLATED_GIT_ENV, GIT_AUTHOR_DATE: isoDate, GIT_COMMITTER_DATE: isoDate };
  const identity = ["-c", "user.name=backlog-test", "-c", "user.email=test@backlog.local", "-c", "commit.gpgsign=false"];
  execFileSync("git", ["add", "-A"], { cwd: repo, env });
  execFileSync("git", [...identity, "commit", "-q", "-m", message], { cwd: repo, env });
}

export async function writeFiles(root: string, files: Record<string, string>): Promise<void> {
  for (const [relativePath, content] of Object.entries(files)) {
    const path = join(root, relativePath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, "utf8");
  }
}

export function projectFile(prefix: string, repos: string[] = []): string {
  return `---\nname: ${prefix.toLowerCase()}\nprefix: ${prefix}\nrepos: [${repos.join(", ")}]\n---\n`;
}

export function taskFile(id: string, fields = ""): string {
  return `---\nid: ${id}\ntitle: Задача ${id}\ncreated: 2026-09-17T10:00:00+03:00\n${fields}---\n`;
}
