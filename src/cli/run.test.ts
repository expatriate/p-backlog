import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { HOOK_STOP_COMMAND, HOOK_STOP_EVENT } from "../core/stats/cost/hook-signature";
import { CLI_COMMANDS, commandName, runCli } from "./run";
import { describe, expect, it } from "vitest";
import { EXIT, type CliEnv } from "./io";
import { baseCliEnv, makeCliSandbox } from "./testing/cli-harness";

describe("runCli", () => {
  it("справку по запросу печатает в stdout с кодом 0, на неизвестную команду — в stderr с кодом 1", async () => {
    const { run } = await makeCliSandbox();
    expect(await run([])).toMatchObject({ code: EXIT.ok, out: expect.stringContaining("Использование"), err: "" });
    expect(await run(["--help"])).toMatchObject({ code: EXIT.ok, out: expect.stringContaining("Использование") });
    expect(await run(["remove", "SPA-1"])).toMatchObject({ code: EXIT.invalid, out: "", err: expect.stringContaining("Использование") });
  });

  it("ошибку разбора аргументов показывает на языке пользователя вместе со справкой по команде", async () => {
    const { run } = await makeCliSandbox();

    const unknown = await run(["list", "--foo"]);
    expect(unknown.code).toBe(EXIT.invalid);
    expect(unknown.err).toContain("Неизвестный параметр --foo");
    expect(unknown.err).toContain("Использование:\n  backlog list ");

    const missing = await run(["list", "--status"]);
    expect(missing.err).toContain("У параметра --status нет значения");

    const withValue = await run(["list", "--json=yes"]);
    expect(withValue.err).toContain("Параметр --json не принимает значения");

    const extra = await run(["list", "лишнее"]);
    expect(extra).toMatchObject({ code: EXIT.invalid, err: expect.stringContaining("Лишние аргументы: лишнее\nИспользование:\n  backlog list ") });
  });

  it("--help у команды печатает её справку в stdout с кодом 0", async () => {
    const { run } = await makeCliSandbox();

    for (const flag of ["--help", "-h"]) {
      const result = await run(["take", flag]);
      expect(result).toMatchObject({ code: EXIT.ok, err: "" });
      expect(result.out).toMatch(/^Использование:\n {2}backlog take /);
    }
  });

  it("нечитаемый каталог беклога даёт сообщение и код 4, а не исключение со стеком", async () => {
    const { repo, home } = await makeCliSandbox();
    const notADir = join(home, "backlog-file");
    await writeFile(notADir, "");
    const warnings: string[] = [];
    const io: CliEnv = { ...baseCliEnv({ cwd: repo, home, backlogRoot: notADir, packageRoot: home }), warn: (line) => warnings.push(line) };

    expect(await runCli(["list"], io)).toBe(EXIT.failed);
    expect(warnings.join("\n")).toContain("ENOTDIR");

    warnings.length = 0;
    expect(await runCli(["hook", "stop"], io)).toBe(EXIT.ok);
    expect(warnings.join("\n")).toContain("ENOTDIR");
  });

  it("неожиданная ошибка команды не уходит стеком: текст в stderr и отдельный код", async () => {
    const { root, repo } = await makeCliSandbox();
    const warnings: string[] = [];
    const io: CliEnv = {
      ...baseCliEnv({ cwd: repo, home: root, backlogRoot: root, packageRoot: root }),
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
