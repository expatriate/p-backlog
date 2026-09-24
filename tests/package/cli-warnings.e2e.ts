import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { gitCommitAll, ISOLATED_GIT_ENV, makeGitRepo, makeTempDir, writeFiles } from "../../src/core/store/testing/temp-dirs";

const repoRoot = join(import.meta.dirname, "../..");
const cliPath = join(repoRoot, "dist/cli.js");

function run(args: string[], options: { cwd: string; env: NodeJS.ProcessEnv; input?: string }): { out: string; err: string } {
  const result = spawnSync(process.execPath, [cliPath, ...args], { ...options, encoding: "utf8" });
  return { out: result.stdout, err: result.stderr };
}

describe("предупреждения Node в собранном CLI", () => {
  it("ExperimentalWarning про SQLite не течёт в stderr — ни когда граф кода не нужен, ни когда он реально используется", async () => {
    const home = await makeTempDir();
    const backlogDir = join(home, "store");
    const env = { ...process.env, ...ISOLATED_GIT_ENV, HOME: home, USERPROFILE: home, BACKLOG_DIR: backlogDir, CLAUDE_CONFIG_DIR: join(home, ".claude"), LC_ALL: "en_US.UTF-8" };

    const repo = await makeGitRepo(home, "demo-app");
    await writeFiles(repo, { "src/a.ts": "1\n" });
    gitCommitAll(repo, "init", new Date().toISOString());

    const withoutGraph = run(["list", "--all-projects"], { cwd: repo, env });
    expect(withoutGraph.err).not.toContain("ExperimentalWarning");

    const created = run(["new", "--category", "bug", "--title", "Task with source", "--source", "src/a.ts:1"], { cwd: repo, env, input: "Body\n" });
    expect(created.out).toMatch(/^[A-Z]+-\d+ /);
    expect(created.err).not.toContain("ExperimentalWarning");

    const checked = run(["check", "--all-projects"], { cwd: repo, env });
    expect(checked.err).not.toContain("ExperimentalWarning");
  }, 60_000);
});
