import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeTempDir } from "../core/store/testing/temp-dirs";
import { startServer } from "./start";

describe("startServer", () => {
  it("поднимает API и статику на заданном порту и закрывается", async () => {
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

  it("записывает PID в файл, если он задан, и удаляет его при закрытии", async () => {
    const home = await makeTempDir();
    const pidFile = join(home, "server.pid");
    const server = await startServer({ root: join(home, "backlog"), port: 0, home, env: {}, pidFile });
    expect(await readFile(pidFile, "utf8")).toBe(String(process.pid));
    await server.close();
    await expect(readFile(pidFile, "utf8")).rejects.toThrow();
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
});
