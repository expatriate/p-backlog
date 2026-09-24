import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeTempDir } from "../../core/store/testing/temp-dirs";
import { startServer } from "../../server/start";
import { EXIT, type CliIo } from "../io";
import { serveCommand } from "./serve";

describe("backlog serve", () => {
  it("занятый порт печатает причину и возвращает код failed", async () => {
    const home = await makeTempDir();
    const blocker = await startServer({ root: join(home, "backlog-1"), port: 0, home, env: {} });
    try {
      const warnings: string[] = [];
      const io: CliIo = {
        cwd: home,
        home,
        backlogRoot: join(home, "backlog-2"),
        repoRoot: home,
        platform: "darwin",
        env: { PORT: String(blocker.port) },
        language: "ru",
        now: () => new Date(),
        readStdin: async () => "",
        print: () => undefined,
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
