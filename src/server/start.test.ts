import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { localeLanguage, settingsFilePath } from "../core/store/settings";
import { makeTempDir, projectFile, taskFile, writeFiles } from "../core/store/testing/temp-dirs";
import { startServer } from "./start";

describe("startServer", () => {
  it("поднимает API на заданном порту и закрывается", async () => {
    const home = await makeTempDir();
    const server = await startServer({ root: join(home, "backlog"), port: 0, home, env: { CLAUDE_CONFIG_DIR: join(home, ".claude") } });
    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/api/settings`);
      expect(response.status).toBe(200);
      expect(await response.json()).toHaveProperty("language");
    } finally {
      await server.close();
    }
  });

  it("при испорченном .settings.json язык ответов берётся из переданного env, а не из окружения процесса", async () => {
    const home = await makeTempDir();
    const root = join(home, "backlog");
    await mkdir(root, { recursive: true });
    await writeFile(settingsFilePath(root), "{ сломано");
    const injected = localeLanguage(process.env) === "ru" ? { LC_ALL: "en_US.UTF-8", expected: "Unknown API route" } : { LC_ALL: "ru_RU.UTF-8", expected: "Неизвестный адрес API" };
    const server = await startServer({ root, port: 0, home, env: { LC_ALL: injected.LC_ALL } });
    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/api/no-such-route`);
      expect(await response.text()).toContain(injected.expected);
    } finally {
      await server.close();
    }
  });

  it("записывает PID в файл, если он задан, и удаляет его при закрытии", async () => {
    const home = await makeTempDir();
    const pidFile = join(home, "server.pid");
    const server = await startServer({ root: join(home, "backlog"), port: 0, home, env: {}, pidFile });
    expect(await readFile(pidFile, "utf8")).toBe(String(process.pid));
    await server.close();
    await expect(readFile(pidFile, "utf8")).rejects.toThrow();
  });

  it("закрывается при открытом потоке /api/events и удаляет PID-файл", async () => {
    const home = await makeTempDir();
    const pidFile = join(home, "server.pid");
    const server = await startServer({ root: join(home, "backlog"), port: 0, home, env: {}, pidFile });
    const events = await fetch(`http://127.0.0.1:${server.port}/api/events`);
    expect(events.status).toBe(200);

    const outcome = await Promise.race([server.close().then(() => "closed"), new Promise((resolve) => setTimeout(resolve, 3000, "hung"))]);

    expect(outcome).toBe("closed");
    await expect(access(pidFile)).rejects.toThrow();
    await events.body?.cancel().catch(() => undefined);
  });

  it("дожидается правки, пришедшей до остановки, и не ждёт таймаута keep-alive после её ответа", async () => {
    const home = await makeTempDir();
    const root = join(home, "backlog");
    await writeFiles(root, { "spa/project.md": projectFile("SPA"), "spa/SPA-1.md": taskFile("SPA-1") });
    const server = await startServer({ root, port: 0, home, env: {} });
    const origin = `http://127.0.0.1:${server.port}`;
    const { tasks } = (await (await fetch(`${origin}/api/tasks`)).json()) as { tasks: { id: string; version: string }[] };
    const lock = join(root, "spa", ".SPA-1.md.lock");
    await writeFile(lock, "другой процесс");
    const patch = fetch(`${origin}/api/tasks/SPA-1`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ version: tasks[0]?.version, changes: { status: "done" } }),
    });
    await new Promise((resolve) => setTimeout(resolve, 200));

    const startedAt = Date.now();
    const closed = server.close().then(() => Date.now() - startedAt);
    await new Promise((resolve) => setTimeout(resolve, 100));
    await rm(lock);

    expect((await patch).status).toBe(200);
    expect(await closed).toBeLessThan(2000);
  });

  it("занятый порт отклоняет промис ошибкой с номером порта", async () => {
    const home = await makeTempDir();
    const first = await startServer({ root: join(home, "backlog-1"), port: 0, home, env: {} });
    try {
      await expect(startServer({ root: join(home, "backlog-2"), port: first.port, home, env: {} })).rejects.toThrow(String(first.port));
    } finally {
      await first.close();
    }
  });

  it("сбой после listen (не записался PID-файл) закрывает порт — он снова свободен", async () => {
    const home = await makeTempDir();
    const probe = await startServer({ root: join(home, "backlog-probe"), port: 0, home, env: {} });
    const port = probe.port;
    await probe.close();

    const pidFile = join(home, "no-such-dir", "server.pid");
    await expect(startServer({ root: join(home, "backlog"), port, home, env: {}, pidFile })).rejects.toThrow();

    const after = await startServer({ root: join(home, "backlog-after"), port, home, env: {} });
    await after.close();
  });

  it("провалившийся listen не оставляет фоновый скан — кеш не пишется в обречённый root", async () => {
    const home = await makeTempDir();
    const claudeConfigDir = join(home, ".claude");
    const transcriptsDir = join(claudeConfigDir, "projects", "demo");
    await mkdir(transcriptsDir, { recursive: true });
    const line = JSON.stringify({ type: "assistant", timestamp: "2026-09-19T09:00:00.000Z", cwd: "/x", message: { model: "claude-opus-5", usage: { input_tokens: 1, output_tokens: 1 } } });
    await writeFile(join(transcriptsDir, "a.jsonl"), `${line}\n`);

    const first = await startServer({ root: join(home, "backlog-1"), port: 0, home, env: {} });
    try {
      const doomedRoot = join(home, "backlog-2");
      await expect(startServer({ root: doomedRoot, port: first.port, home, env: { CLAUDE_CONFIG_DIR: claudeConfigDir } })).rejects.toThrow();

      await new Promise((resolve) => setTimeout(resolve, 500));
      await expect(access(join(doomedRoot, ".usage-cache.json"))).rejects.toThrow();
    } finally {
      await first.close();
    }
  });
});
