import { commandName, runCli } from "./run";
import { describe, expect, it } from "vitest";
import { EXIT, type CliIo } from "./io";
import { makeCliSandbox } from "./testing/cli-harness";

describe("runCli", () => {
  it("без команды печатает справку, с неизвестной командой — код 1", async () => {
    const { run } = await makeCliSandbox();
    expect(await run([])).toMatchObject({ code: EXIT.ok, err: expect.stringContaining("Использование") });
    expect((await run(["--help"])).code).toBe(EXIT.ok);
    expect((await run(["remove", "SPA-1"])).code).toBe(EXIT.invalid);
  });

  it("неожиданная ошибка команды не уходит стеком: текст в stderr и отдельный код", async () => {
    const { root, repo } = await makeCliSandbox();
    const warnings: string[] = [];
    const io: CliIo = {
      cwd: repo,
      home: root,
      backlogRoot: root,
      now: () => new Date("2026-09-18T12:00:00Z"),
      readStdin: () => Promise.reject(new Error("не прочитать stdin")),
      print: () => undefined,
      warn: (line) => warnings.push(line),
    };

    const code = await runCli(["new", "--category", "bug", "--title", "Таймаут"], io);

    expect(code).toBe(EXIT.failed);
    expect(warnings.at(-1)).toBe("Команда new не выполнена: не прочитать stdin");
  });
});

describe("commandName", () => {
  it("для hook возвращает «hook» и второе слово", () => {
    expect(commandName(["hook", "stop"])).toBe("hook stop");
  });

  it("для пустых аргументов возвращает «help»", () => {
    expect(commandName([])).toBe("help");
  });

  it("для неизвестной команды возвращает «help»", () => {
    expect(commandName(["nope"])).toBe("help");
  });

  it("возвращает первое слово известной команды, флаги отбрасывает", () => {
    expect(commandName(["list", "--all-projects"])).toBe("list");
  });
});
