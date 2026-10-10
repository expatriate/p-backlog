import { Server } from "node:net";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { makeTempDir } from "../../core/store/testing/temp-dirs";
import { startServer } from "../../server/start";
import { QUIET_HOST } from "../../server/testing/quiet-host";
import { cliIo, EXIT, parsePort } from "../io";
import { baseCliEnv, makeCliSandbox } from "../testing/cli-harness";
import { serveCommand } from "./serve";

function failIfServerStarts(): void {
  vi.spyOn(Server.prototype, "listen").mockImplementation(() => {
    throw new Error("serve запустил сервер");
  });
}

describe("backlog serve", () => {
  it.each(["abc", "0", "99999"])("--port %s отклоняет кодом 1, а не запускает сервер на 4317", async (port) => {
    const { run } = await makeCliSandbox();
    failIfServerStarts();

    const result = await run(["serve", "--port", port]);

    expect(result.code).toBe(EXIT.invalid);
    expect(result.err).toContain(port);
  });

  it("пустой --port — неверный порт, а не порт по умолчанию", () => {
    expect(() => parsePort("ru", "")).toThrow("--port: ожидается число от 1 до 65535, получено «»");
  });

  it("неверный PORT из окружения отклоняется с именем переменной, а не заменяется на 4317", async () => {
    const { run } = await makeCliSandbox();
    failIfServerStarts();

    const result = await run(["serve"], { env: { PORT: "abc" } });

    expect(result.code).toBe(EXIT.invalid);
    expect(result.err).toContain("PORT: ожидается число от 1 до 65535, получено «abc»");
  });

  it("занятый порт печатает причину и возвращает код failed", async () => {
    const home = await makeTempDir();
    const blocker = await startServer({ ...QUIET_HOST, root: join(home, "backlog-1"), port: 0, home, env: {} });
    try {
      const warnings: string[] = [];
      const io = cliIo(
        {
          ...baseCliEnv({ cwd: home, home, backlogRoot: join(home, "backlog-2"), packageRoot: home }),
          env: { PORT: String(blocker.port) },
          warn: (line) => warnings.push(line),
        },
        "ru",
      );

      const code = await serveCommand.run([], io);

      expect(code).toBe(EXIT.failed);
      expect(warnings.at(-1)).toContain(String(blocker.port));
    } finally {
      await blocker.close();
    }
  });
});
