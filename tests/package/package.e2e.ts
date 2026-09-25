import { execFileSync, execSync, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { stopHookFor } from "../../src/cli/stop-hook";
import { gitCommitAll, ISOLATED_GIT_ENV, makeGitRepo, makeTempDir, writeFiles } from "../../src/core/store/testing/temp-dirs";

const repoRoot = join(import.meta.dirname, "../..");
const isWindows = process.platform === "win32";

let prefix: string;
let backlogBin: string;
let packageDir: string;
let work: string;

beforeAll(async () => {
  work = await realpath(await mkdtemp(join(tmpdir(), "backlog-package-test-")));
  const npmEnv = { ...process.env, HOME: join(work, "npm-home"), USERPROFILE: join(work, "npm-home"), npm_config_cache: join(work, "npm-cache") };
  const npm = (args: string[], options: { cwd?: string } = {}) =>
    execFileSync("npm", isWindows ? args.map(quoteForWindowsShell) : args, { ...options, encoding: "utf8", shell: isWindows, env: npmEnv });
  const packed = npm(["pack", "--pack-destination", work, "--json"], { cwd: repoRoot });
  const tarball = join(work, JSON.parse(packed.slice(packed.search(/^\[\r?$/m)))[0].filename);
  prefix = join(work, "prefix");
  npm(["install", "-g", "--prefix", prefix, tarball]);
  backlogBin = isWindows ? join(prefix, "backlog.cmd") : join(prefix, "bin", "backlog");
  packageDir = isWindows ? join(prefix, "node_modules", "p-backlog") : join(prefix, "lib", "node_modules", "p-backlog");
}, 300_000);

afterAll(async () => {
  await rm(work, { recursive: true, force: true });
});

function quoteForWindowsShell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

function isolatedEnv(home: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...ISOLATED_GIT_ENV,
    HOME: home,
    USERPROFILE: home,
    BACKLOG_DIR: join(home, "store"),
    CLAUDE_CONFIG_DIR: join(home, ".claude"),
    CODEX_HOME: join(home, ".codex"),
    LC_ALL: "en_US.UTF-8",
    PATH: `${join(prefix, isWindows ? "" : "bin")}${isWindows ? ";" : ":"}${process.env.PATH ?? ""}`,
  };
}

function backlogRunner(env: NodeJS.ProcessEnv) {
  return (args: string[], options: { input?: string; cwd?: string } = {}) =>
    isWindows
      ? execFileSync(quoteForWindowsShell(backlogBin), args.map(quoteForWindowsShell), { ...options, env, encoding: "utf8", shell: true })
      : execFileSync(backlogBin, args, { ...options, env, encoding: "utf8" });
}

describe("путь нового пользователя из tarball", () => {
  it("setup, new, hook и serve работают из установленного пакета", async () => {
    const home = await makeTempDir();
    const claudeConfigDir = join(home, ".claude");
    const env = isolatedEnv(home);
    const run = backlogRunner(env);

    run(["setup"]);
    const skillLink = join(claudeConfigDir, "skills", "backlog");
    const skillSource = join(packageDir, "skill", "backlog-en");
    expect(await realpath(skillLink)).toBe(await realpath(skillSource));
    expect(await readFile(join(skillLink, "SKILL.md"), "utf8")).toMatch(/^---/);
    const settings = JSON.parse(await readFile(join(claudeConfigDir, "settings.json"), "utf8"));
    const installedHook = settings.hooks.Stop[0].hooks[0];
    expect(installedHook).toEqual(stopHookFor(process.platform));
    const hookCommand = installedHook.command as string;

    const repo = await makeGitRepo(join(home, "проекты"), "demo-app");
    await writeFiles(repo, { "src/a.ts": "1\n" });
    gitCommitAll(repo, "init", new Date().toISOString());
    const created = run(["new", "--category", "bug", "--title", "First task", "--source", "src/a.ts:1"], { cwd: repo, input: "Body\n" });
    expect(created).toMatch(/^[A-Z]+-\d+ /);
    await writeFile(join(repo, "src", "a.ts"), "2\n");

    const runHook = (session: string) =>
      JSON.parse(
        execFileSync(isWindows ? "powershell" : "sh", isWindows ? ["-NoProfile", "-Command", hookCommand] : ["-c", hookCommand], {
          cwd: repo,
          env,
          input: JSON.stringify({ cwd: repo, session_id: session }),
          encoding: "utf8",
        }),
      );
    expect(runHook("s1")).toMatchObject({ decision: "block" });

    const port = await freePort();
    const server = isWindows
      ? spawn(process.execPath, [join(packageDir, "dist", "cli.js"), "serve", "--port", String(port)], { env })
      : spawn(backlogBin, ["serve", "--port", String(port)], { env });
    try {
      const deadline = Date.now() + 20_000;
      let settingsResponse: { language: string } | undefined;
      while (Date.now() < deadline && settingsResponse === undefined) {
        settingsResponse = await fetch(`http://127.0.0.1:${port}/api/settings`)
          .then((response) => (response.status === 200 ? response.json() : undefined))
          .catch(() => undefined);
        if (settingsResponse === undefined) await new Promise((resolve) => setTimeout(resolve, 200));
      }
      expect(settingsResponse).toEqual({ language: "en" });

      const page = await fetch(`http://127.0.0.1:${port}/`);
      expect(page.status).toBe(200);
      expect(await page.text()).toContain('<div id="root">');
    } finally {
      server.kill();
    }

    run(["config", "language", "ru"]);
    expect(runHook("s2").reason).toContain("после последней проверки менялся код задач");
  }, 300_000);

  it("setup подключает Codex и Cursor, их хуки отвечают на настоящее событие через оболочку платформы", async () => {
    const home = await makeTempDir();
    const codexHome = join(home, ".codex");
    const cursorHome = join(home, ".cursor");
    await mkdir(codexHome, { recursive: true });
    await mkdir(cursorHome, { recursive: true });
    const env = isolatedEnv(home);
    const run = backlogRunner(env);

    run(["setup"]);
    expect(await realpath(join(home, ".agents", "skills", "backlog"))).toBe(await realpath(join(packageDir, "skill", "backlog-en")));
    const codexHook = JSON.parse(await readFile(join(codexHome, "hooks.json"), "utf8")).hooks.Stop[0].hooks[0];
    const cursorHook = JSON.parse(await readFile(join(cursorHome, "hooks.json"), "utf8")).hooks.stop[0];

    const repo = await makeGitRepo(join(home, "projects"), "demo-app");
    await writeFiles(repo, { "src/a.ts": "1\n" });
    gitCommitAll(repo, "init", new Date().toISOString());
    run(["new", "--category", "bug", "--title", "First task", "--source", "src/a.ts:1"], { cwd: repo, input: "Body\n" });
    await writeFile(join(repo, "src", "a.ts"), "2\n");

    const runInShell = (command: string, cwd: string, event: object) => JSON.parse(execSync(command, { cwd, env, input: JSON.stringify(event), encoding: "utf8" }));
    const codexCommand = isWindows ? codexHook.commandWindows : codexHook.command;

    expect(runInShell(codexCommand, repo, { session_id: "codex-1", turn_id: "t1", cwd: repo, hook_event_name: "Stop", stop_hook_active: false })).toMatchObject({
      decision: "block",
      reason: expect.stringContaining("src/a.ts"),
    });
    expect(runInShell(cursorHook.command, cursorHome, { conversation_id: "cursor-1", generation_id: "g1", workspace_roots: [repo], status: "completed", loop_count: 0 })).toEqual({
      followup_message: expect.stringContaining("src/a.ts"),
    });
  }, 300_000);
});
