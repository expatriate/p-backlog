import { execFileSync, spawn } from "node:child_process";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
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
  const packed = execFileSync("npm", ["pack", "--pack-destination", work, "--json"], { cwd: repoRoot, encoding: "utf8", shell: isWindows, env: npmEnv });
  const tarball = join(work, JSON.parse(packed.slice(packed.indexOf("[")))[0].filename);
  prefix = join(work, "prefix");
  execFileSync("npm", ["install", "-g", "--prefix", prefix, tarball], { encoding: "utf8", shell: isWindows, env: npmEnv });
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

describe("путь нового пользователя из tarball", () => {
  it("setup, new, hook и serve работают из установленного пакета", async () => {
    const home = await makeTempDir();
    const claudeConfigDir = join(home, ".claude");
    const env = {
      ...process.env,
      ...ISOLATED_GIT_ENV,
      HOME: home,
      USERPROFILE: home,
      BACKLOG_DIR: join(home, "store"),
      CLAUDE_CONFIG_DIR: claudeConfigDir,
      LC_ALL: "en_US.UTF-8",
      PATH: `${join(prefix, isWindows ? "" : "bin")}${isWindows ? ";" : ":"}${process.env.PATH ?? ""}`,
    };
    const run = (args: string[], options: { input?: string; cwd?: string } = {}) =>
      isWindows
        ? execFileSync(quoteForWindowsShell(backlogBin), args.map(quoteForWindowsShell), { ...options, env, encoding: "utf8", shell: true })
        : execFileSync(backlogBin, args, { ...options, env, encoding: "utf8" });

    run(["setup"]);
    const skillLink = join(claudeConfigDir, "skills", "backlog");
    const skillSource = join(packageDir, "skill", "backlog-en");
    expect(await realpath(skillLink)).toBe(await realpath(skillSource));
    expect(await readFile(join(skillLink, "SKILL.md"), "utf8")).toMatch(/^---/);
    const settings = JSON.parse(await readFile(join(claudeConfigDir, "settings.json"), "utf8"));
    const installedHook = settings.hooks.Stop[0].hooks[0];
    expect(installedHook).toEqual(stopHookFor(process.platform));
    const hookCommand = installedHook.command as string;

    const repo = await makeGitRepo(home, "demo-app");
    await writeFiles(repo, { "src/a.ts": "1\n" });
    gitCommitAll(repo, "init", new Date().toISOString());
    const created = run(["new", "--category", "bug", "--title", "First task", "--source", "src/a.ts:1"], { cwd: repo, input: "Body\n" });
    expect(created).toMatch(/^[A-Z]+-\d+ /);
    await writeFile(join(repo, "src", "a.ts"), "2\n");

    const hookOutput = execFileSync(isWindows ? "powershell" : "sh", isWindows ? ["-NoProfile", "-Command", hookCommand] : ["-c", hookCommand], {
      cwd: repo,
      env,
      input: JSON.stringify({ cwd: repo, session_id: "s1" }),
      encoding: "utf8",
    });
    expect(JSON.parse(hookOutput)).toMatchObject({ decision: "block" });

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
  }, 300_000);
});
