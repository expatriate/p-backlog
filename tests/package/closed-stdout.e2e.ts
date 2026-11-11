import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BYTES_PER_MEBIBYTE } from "../../src/core/numbers";
import { readRuns } from "../../src/core/store/testing/runs";
import { gitCommitAll, makeGitRepo, makeTempDir, writeFiles } from "../../src/core/store/testing/temp-dirs";
import { isolatedHomeEnv } from "../isolated-process";

const repoRoot = join(import.meta.dirname, "../..");
const cliPath = join(repoRoot, "dist/cli.js");
const BODY_FAR_LARGER_THAN_PIPE_BUFFER = "x".repeat(BYTES_PER_MEBIBYTE);

function runWithReaderClosedAfterFirstChunk(args: string[], options: { cwd: string; env: NodeJS.ProcessEnv }): Promise<{ code: number | null; err: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], { ...options, stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => (err += chunk));
    child.stdout.once("data", () => child.stdout.destroy());
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, err }));
  });
}

describe("собранный CLI, когда читатель stdout закрылся раньше конца вывода", () => {
  it("выходит с кодом команды без стека EPIPE и записывает запуск в журнал", async () => {
    const home = await makeTempDir();
    const backlogRoot = join(home, "backlog");
    const env = { ...isolatedHomeEnv(home), BACKLOG_DIR: backlogRoot };

    const repo = await makeGitRepo(home, "demo-app");
    await writeFiles(repo, { "src/a.ts": "1\n" });
    gitCommitAll(repo, "init", new Date().toISOString());
    const created = spawnSync(process.execPath, [cliPath, "new", "--category", "bug", "--title", "Huge task", "--source", "src/a.ts:1"], { cwd: repo, env, input: BODY_FAR_LARGER_THAN_PIPE_BUFFER });
    expect(created.status).toBe(0);

    const listed = await runWithReaderClosedAfterFirstChunk(["list", "--json"], { cwd: repo, env });

    expect(listed.err).not.toContain("EPIPE");
    expect(listed.code).toBe(0);
    expect((await readRuns(backlogRoot)).map((run) => run.command)).toEqual(["new", "list"]);
  }, 60_000);
});
