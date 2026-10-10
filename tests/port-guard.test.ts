import { spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { freePort } from "../src/cli/testing/free-port";

const REFUSAL = "порт живой службы p-backlog";

let guardedPort: number;

beforeEach(async () => {
  guardedPort = await freePort();
  vi.stubEnv("P_BACKLOG_GUARDED_PORT", String(guardedPort));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("охранник порта живой службы", () => {
  it("не даёт тесту занять порт службы", () => {
    expect(() => createServer().listen(guardedPort, "127.0.0.1")).toThrow(REFUSAL);
  });

  it("отклоняет HTTP-запрос к порту службы до соединения", async () => {
    await expect(fetch(`http://127.0.0.1:${guardedPort}/`)).rejects.toMatchObject({ cause: { message: expect.stringContaining(REFUSAL) } });
  });

  it("действует и в дочернем процессе node", () => {
    const child = spawnSync(process.execPath, ["-e", `require("node:net").createServer().listen(${guardedPort}, "127.0.0.1", () => process.exit(0))`], { encoding: "utf8" });

    expect(child.status).not.toBe(0);
    expect(child.stderr).toContain(REFUSAL);
  });
});
