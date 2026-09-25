import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeTempDir } from "../../core/store/testing/temp-dirs";
import { startServer } from "../../server/start";
import { EXIT, type CliIo } from "../io";
import { baseCliEnv, makeCliSandbox } from "../testing/cli-harness";
import { serveCommand } from "./serve";

describe("backlog serve", () => {
  it.each(["abc", "0", "99999"])("--port %s отклоняет кодом 1, а не запускает сервер на 4317", async (port) => {
    const { run } = await makeCliSandbox();

    const result = await run(["serve", "--port", port]);

    expect(result.code).toBe(EXIT.invalid);
    expect(result.err).toContain(port);
  });

  it("неверный PORT из окружения отклоняется с именем переменной, а не заменяется на 4317", async () => {
    const { run } = await makeCliSandbox();

    const result = await run(["serve"], { env: { PORT: "abc" } });

    expect(result.code).toBe(EXIT.invalid);
    expect(result.err).toContain("PORT: ожидается число от 1 до 65535, получено «abc»");
  });

  it("занятый порт печатает причину и возвращает код failed", async () => {
    const home = await makeTempDir();
    const blocker = await startServer({ root: join(home, "backlog-1"), port: 0, home, env: {} });
    try {
      const warnings: string[] = [];
      const io: CliIo = {
        ...baseCliEnv({ cwd: home, home, backlogRoot: join(home, "backlog-2"), packageRoot: home }),
        env: { PORT: String(blocker.port) },
        language: "ru",
        warn: (line) => warnings.push(line),
      };

      const code = await serveCommand.run([], io);

      expect(code).toBe(EXIT.failed);
      expect(warnings.at(-1)).toContain(String(blocker.port));
    } finally {
      await blocker.close();
    }
  });
});
