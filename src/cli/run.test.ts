import { readFile } from "node:fs/promises";
import { HOOK_STOP_COMMAND, HOOK_STOP_EVENT } from "../core/stats/cost/hook-signature";
import { CLI_COMMANDS, commandName, runCli } from "./run";
import { describe, expect, it } from "vitest";
import { EXIT, type CliEnv } from "./io";
import { baseCliEnv, makeCliSandbox } from "./testing/cli-harness";

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
    const io: CliEnv = {
      ...baseCliEnv({ cwd: repo, home: root, backlogRoot: root, repoRoot: root }),
      now: () => new Date("2026-09-18T12:00:00Z"),
      readStdin: () => Promise.reject(new Error("не прочитать stdin")),
      warn: (line) => warnings.push(line),
    };

    const code = await runCli(["new", "--category", "bug", "--title", "Таймаут"], io);

    expect(code).toBe(EXIT.failed);
    expect(warnings.at(-1)).toBe("Команда new не выполнена: не прочитать stdin");
  });
});

describe("README", () => {
  it.each(["README.md", "README.ru.md"])("таблица команд в %s описывает каждую команду CLI", async (file) => {
    const readme = await readFile(new URL(`../../${file}`, import.meta.url), "utf8");
    const rows = readme.split("\n").filter((line) => line.startsWith("| `backlog "));
    const missing = CLI_COMMANDS.filter(
      ({ name }) => !rows.some((row) => row.startsWith(`| \`backlog ${name} `) || row.startsWith(`| \`backlog ${name}\``)),
    );
    expect(missing.map(({ name }) => name)).toEqual([]);
  });
});

describe("commandName", () => {
  it("для хука Stop возвращает команду, по которой статистика отделяет запуски хука", () => {
    expect(commandName(["hook", HOOK_STOP_EVENT])).toBe(HOOK_STOP_COMMAND);
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
