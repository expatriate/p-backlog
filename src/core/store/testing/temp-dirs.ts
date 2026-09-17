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

export async function makeGitRepo(parent: string, name: string): Promise<string> {
  const dir = join(parent, name);
  await mkdir(dir, { recursive: true });
  execFileSync("git", ["init", "-q"], { cwd: dir });
  return dir;
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
