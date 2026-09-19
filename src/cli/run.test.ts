import { commandName } from "./run";
import { describe, expect, it } from "vitest";
import { EXIT } from "./io";
import { makeCliSandbox } from "./testing/cli-harness";

describe("runCli", () => {
  it("без команды печатает справку, с неизвестной командой — код 1", async () => {
    const { run } = await makeCliSandbox();
    expect(await run([])).toMatchObject({ code: EXIT.ok, err: expect.stringContaining("Использование") });
    expect((await run(["--help"])).code).toBe(EXIT.ok);
    expect((await run(["remove", "SPA-1"])).code).toBe(EXIT.invalid);
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
