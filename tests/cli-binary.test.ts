import { execFileSync, spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { access } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { ISOLATED_GIT_ENV, makeGitRepo, makeTempDir } from "../src/core/store/testing/temp-dirs";

const buildDir = join(import.meta.dirname, "../dist/test");
const cli = join(buildDir, "cli.js");

beforeAll(() => {
  execFileSync("node", ["scripts/build-node.mjs", "--outdir", buildDir], { cwd: join(import.meta.dirname, "..") });
}, 60_000);

describe("собранный бинарник backlog", () => {
  it("создаёт задачу из stdin, показывает её и меняет статус", async () => {
    const home = await makeTempDir();
    const repo = await makeGitRepo(home, "demo-app");
    const env = { ...process.env, ...ISOLATED_GIT_ENV, HOME: home, BACKLOG_DIR: join(home, "store"), LC_ALL: "ru_RU.UTF-8" };
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

  it.skipIf(process.platform === "win32")("serve по SIGTERM закрывается при открытом /api/events и удаляет PID-файл", async () => {
    const home = await makeTempDir();
    const pidFile = join(home, "server.pid");
    const port = await freePort();
    const server = spawn(process.execPath, [cli, "serve", "--port", String(port)], {
      env: { ...process.env, HOME: home, BACKLOG_DIR: join(home, "store"), P_BACKLOG_PID_FILE: pidFile },
      stdio: ["ignore", "pipe", "pipe"],
    });
    try {
      await once(server.stdout, "data");
      const events = await fetch(`http://127.0.0.1:${port}/api/events`);
      expect(events.status).toBe(200);

      server.kill("SIGTERM");
      const [code] = (await Promise.race([once(server, "exit"), new Promise((resolve) => setTimeout(resolve, 5000, ["hung"]))])) as unknown[];

      expect(code).toBe(0);
      await expect(access(pidFile)).rejects.toThrow();
    } finally {
      server.kill("SIGKILL");
    }
  });
});

async function freePort(): Promise<number> {
  const probe = createServer().listen(0, "127.0.0.1");
  await once(probe, "listening");
  const address = probe.address();
  probe.close();
  if (address === null || typeof address === "string") throw new Error("нет порта");
  return address.port;
}
