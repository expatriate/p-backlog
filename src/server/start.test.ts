import { access, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { subscribe, unsubscribe } from "node:diagnostics_channel";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { connect } from "node:net";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { coreMessages } from "../core/messages";
import { localeLanguage, settingsFilePath } from "../core/store/settings";
import { sweepClosedWhenDue } from "../core/store/sweep";
import { journalWithTaskGoneLongAgo } from "../core/store/testing/stale-journal";
import { makeTempDir, projectFile, taskFile, writeFiles } from "../core/store/testing/temp-dirs";
import { startServer } from "./start";

const NOW = new Date("2026-09-18T12:00:00+03:00");

function requestArrived(method: string): Promise<void> {
  const { promise, resolve }: PromiseWithResolvers<void> = Promise.withResolvers();
  const onRequestStart = (message: unknown) => {
    if ((message as { request: IncomingMessage }).request.method !== method) return;
    unsubscribe("http.server.request.start", onRequestStart);
    resolve();
  };
  subscribe("http.server.request.start", onRequestStart);
  return promise;
}

async function stoppedListening(port: number): Promise<void> {
  await vi.waitFor(
    () =>
      new Promise<void>((resolve, reject) => {
        const socket = connect(port, "127.0.0.1");
        socket.once("connect", () => {
          socket.destroy();
          reject(new Error(`порт ${port} ещё принимает соединения`));
        });
        socket.once("error", () => resolve());
      }),
    { timeout: 3_000 },
  );
}

function statusWithHost(port: number, host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const request = httpRequest({ host: "127.0.0.1", port, path: "/api/settings", headers: { host } }, (response) => {
      response.resume();
      resolve(response.statusCode ?? 0);
    });
    request.on("error", reject);
    request.end();
  });
}

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

  it("отвечает на Host localhost, 127.0.0.1 и [::1] своего порта, чужой Host — 403", async () => {
    const home = await makeTempDir();
    const server = await startServer({ root: join(home, "backlog"), port: 0, home, env: {} });
    try {
      const hosts = [`localhost:${server.port}`, `127.0.0.1:${server.port}`, `[::1]:${server.port}`, `evil.example:${server.port}`, "localhost:1"];
      const statuses = await Promise.all(hosts.map(async (host) => [host, await statusWithHost(server.port, host)] as const));
      expect(Object.fromEntries(statuses)).toEqual({
        [`localhost:${server.port}`]: 200,
        [`127.0.0.1:${server.port}`]: 200,
        [`[::1]:${server.port}`]: 200,
        [`evil.example:${server.port}`]: 403,
        "localhost:1": 403,
      });
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

    await server.close();

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
    const patchArrived = requestArrived("PATCH");
    const patch = fetch(`${origin}/api/tasks/SPA-1`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ version: tasks[0]?.version, changes: { status: "done" } }),
    });
    await patchArrived;

    const closeStartedAt = performance.now();
    const closeDuration = server.close().then(() => performance.now() - closeStartedAt);
    await stoppedListening(server.port);
    await rm(lock);

    expect((await patch).status).toBe(200);
    expect(await closeDuration).toBeLessThan(2000);
  });

  it("служба при старте уплотняет журналы проектов", async () => {
    const home = await makeTempDir();
    const root = join(home, "backlog");
    await writeFiles(root, { "spa/project.md": projectFile("SPA"), "spa/SPA-1.md": taskFile("SPA-1"), "spa/journal.jsonl": journalWithTaskGoneLongAgo(NOW) });

    const server = await startServer({ root, port: 0, home, env: {}, now: () => NOW });
    await server.close();

    const journal = await readFile(join(root, "spa", "journal.jsonl"), "utf8");
    expect(journal).not.toContain("SPA-3");
    expect(journal).toContain("SPA-1");
  });

  it("сбой уборки закрытых задач не мешает службе уплотнить журналы", async () => {
    const home = await makeTempDir();
    const root = join(home, "backlog");
    await writeFiles(root, { "spa/project.md": projectFile("SPA"), "spa/SPA-1.md": taskFile("SPA-1"), "spa/journal.jsonl": journalWithTaskGoneLongAgo(NOW) });
    await mkdir(join(root, "bbb", "project.md"), { recursive: true });

    const server = await startServer({ root, port: 0, home, env: {}, now: () => NOW });
    await server.close();

    expect(await readFile(join(root, "spa", "journal.jsonl"), "utf8")).not.toContain("SPA-3");
  });

  it("после уборки службы CLI в тот же день закрытые задачи не убирает повторно", async () => {
    const home = await makeTempDir();
    const root = join(home, "backlog");
    await writeFiles(root, { "spa/project.md": projectFile("SPA") });

    const server = await startServer({ root, port: 0, home, env: {}, now: () => NOW });
    await server.close();

    expect(await sweepClosedWhenDue(root, NOW, coreMessages("ru"))).toBeNull();
  });

  it.runIf(process.platform === "darwin")("служба при старте обрезает свой лог", async () => {
    const home = await makeTempDir();
    const root = join(home, "backlog");
    const logPath = join(home, "Library/Logs/p-backlog.log");
    await mkdir(dirname(logPath), { recursive: true });
    await writeFile(logPath, "line 0000000000000000000000000000000000\n".repeat(80_000));
    expect((await stat(logPath)).size).toBeGreaterThan(2 * 1024 * 1024);

    const server = await startServer({ root, port: 0, home, env: {} });
    await server.close();

    expect((await stat(logPath)).size).toBeLessThanOrEqual(256 * 1024);
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

      const laterRoot = join(home, "backlog-3");
      const later = await startServer({ root: laterRoot, port: 0, home, env: { CLAUDE_CONFIG_DIR: claudeConfigDir } });
      await vi.waitFor(() => access(join(laterRoot, ".usage-cache.json")));
      await later.close();
      await expect(access(join(doomedRoot, ".usage-cache.json"))).rejects.toThrow();
    } finally {
      await first.close();
    }
  });
});
