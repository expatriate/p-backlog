import { execFileSync, spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { access, chmod, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { beforeAll, describe, expect, it, onTestFinished } from "vitest";
import { freePort } from "../src/cli/testing/free-port";
import { HOOK_STOP_COMMAND, HOOK_STOP_EVENT } from "../src/core/hook-signature";
import { readRuns } from "../src/core/store/testing/runs";
import { makeGitRepo, makeTempDir } from "../src/core/store/testing/temp-dirs";
import { isolatedHomeEnv } from "./isolated-process";

const buildDir = join(import.meta.dirname, "../dist/test");
const cli = join(buildDir, "cli.js");

beforeAll(() => {
  execFileSync("node", ["scripts/build-node.mjs", "--outdir", buildDir], { cwd: join(import.meta.dirname, "..") });
}, 60_000);

describe("собранный бинарник backlog", () => {
  it("создаёт задачу из stdin, показывает её и меняет статус", async () => {
    const home = await makeTempDir();
    const repo = await makeGitRepo(home, "demo-app");
    const env = { ...isolatedHomeEnv(home), LC_ALL: "ru_RU.UTF-8" };
    const run = (args: string[], input?: string) => spawnSync(process.execPath, [cli, ...args], { cwd: repo, env, input, encoding: "utf8" });

    const created = run(["new", "--category", "bug", "--title", "Проверка бинарника"], "- [ ] шаг\n");
    expect(created.status).toBe(0);
    expect(created.stdout).toMatch(/^DA-1 .*DA-1\.md\n$/);

    const taken = run(["take", "DA-1"]);
    expect(taken.status).toBe(0);
    expect(taken.stdout).toContain("Статус: in-progress");

    expect(run(["take", "DA-404"]).status).toBe(2);
    expect(run(["status", "DA-1", "done"]).stderr).toContain("не отмечено пунктов чеклиста — 1");
  });

  it("хук Stop с параметром перед событием записывается в журнал запусков как хук, а не как обычная команда", async () => {
    const home = await makeTempDir();

    spawnSync(process.execPath, [cli, "hook", "--agent", "codex", HOOK_STOP_EVENT], { cwd: home, env: isolatedHomeEnv(home), input: "" });

    expect((await readRuns(join(home, "store"))).map(({ command }) => command)).toEqual([HOOK_STOP_COMMAND]);
  });

  it.skipIf(process.platform === "win32")("serve по SIGTERM закрывается при открытом /api/events, удаляет PID-файл и не попадает в журнал запусков", async () => {
    const home = await makeTempDir();
    const pidFile = join(home, "server.pid");
    const port = await freePort();
    const fallbackPort = await freePort();
    const env = { ...isolatedHomeEnv(home), P_BACKLOG_PID_FILE: pidFile, PORT: String(fallbackPort) };
    const server = spawn(process.execPath, [cli, "serve", "--port", String(port)], { env, stdio: ["ignore", "pipe", "pipe"] });
    try {
      await once(server.stdout, "data");
      await access(pidFile);
      const events = await fetch(`http://127.0.0.1:${port}/api/events`);
      expect(events.status).toBe(200);

      server.kill("SIGTERM");
      const [code] = (await Promise.race([once(server, "exit"), new Promise((resolve) => setTimeout(resolve, 5000, ["hung"]))])) as unknown[];

      expect(code).toBe(0);
      await expect(access(pidFile)).rejects.toThrow();
      spawnSync(process.execPath, [cli, "list", "--help"], { cwd: home, env });
      expect((await readRuns(join(home, "store"))).map(({ command }) => command)).toEqual(["list"]);
    } finally {
      server.kill("SIGKILL");
    }
  });

  it.skipIf(process.platform === "win32")("serve в каталоге без записи говорит, что язык не сохранён, один раз, а не ещё и из сервера (на Windows chmod не закрывает каталог)", async () => {
    const home = await makeTempDir();
    const root = join(home, "store");
    await mkdir(root);
    await chmod(root, 0o500);
    onTestFinished(() => chmod(root, 0o700));
    const port = await freePort();
    const fallbackPort = await freePort();
    const server = spawn(process.execPath, [cli, "serve", "--port", String(port)], { env: { ...isolatedHomeEnv(home), LC_ALL: "ru_RU.UTF-8", PORT: String(fallbackPort) }, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    server.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    try {
      await once(server.stdout, "data");
      server.kill("SIGTERM");
      await once(server, "close");
    } finally {
      server.kill("SIGKILL");
    }

    expect(stderr.match(/Не удалось сохранить язык/g)).toHaveLength(1);
  });
});
