import { chmod, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { HOOK_STOP_COMMAND, HOOK_STOP_EVENT } from "../core/hook-signature";
import { settingsFilePath } from "../core/store/settings";
import { loadBacklog } from "../core/store/load";
import { CLI_COMMANDS, commandName, runCli } from "./run";
import { describe, expect, it, onTestFinished } from "vitest";
import { EXIT, type CliEnv } from "./io";
import { baseCliEnv, fakeExec, makeCliSandbox } from "./testing/cli-harness";

describe("runCli", () => {
  it("справку по запросу печатает в stdout с кодом 0, на неизвестную команду — в stderr с кодом 1", async () => {
    const { run } = await makeCliSandbox();
    expect(await run([])).toMatchObject({ code: EXIT.ok, out: expect.stringContaining("Использование"), err: "" });
    for (const flag of ["help", "--help", "-h", "--help=x", "--h", "-hx"]) expect(await run([flag]), flag).toMatchObject({ code: EXIT.ok, out: expect.stringContaining("Использование") });
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

  it("значение на «-» подсказывает форму --параметр=значение, повтор параметра не теряет первое значение молча", async () => {
    const { run, root } = await makeCliSandbox();

    const dashed = await run(["new", "--category", "bug", "--title", "--json ломает вывод"]);
    const repeated = await run(["new", "--category", "bug", "--title", "Первый", "--title", "Второй"]);
    const inline = await run(["new", "--category", "bug", "--title=--json ломает вывод"]);

    expect(dashed).toMatchObject({ code: EXIT.invalid, err: expect.stringContaining("--title=") });
    expect(repeated).toMatchObject({ code: EXIT.invalid, err: expect.stringContaining("--title указан дважды") });
    expect(inline.code).toBe(EXIT.ok);
    expect((await loadBacklog(root)).tasks.map((task) => task.title)).toEqual(["--json ломает вывод"]);
  });

  it("--help у любой команды печатает её справку в stdout с кодом 0 и ничего не делает", async () => {
    const { run, home } = await makeCliSandbox();
    const filesBefore = await readdir(home, { recursive: true });
    const { exec, calls } = fakeExec();

    for (const { name } of CLI_COMMANDS) {
      for (const flag of ["--help", "-h"]) {
        const result = await run([name, flag], { exec });
        expect(result).toMatchObject({ code: EXIT.ok, err: "" });
        expect(result.out).toMatch(new RegExp(`^Использование:\n {2}backlog ${name} `));
      }
    }
    expect(calls).toEqual([]);
    expect(await readdir(home, { recursive: true })).toEqual(filesBefore);
  });

  it("-h на месте значения параметра или после -- — не справка: команда отказывает с подсказкой, а -h после булева флага — справка", async () => {
    const { run } = await makeCliSandbox();

    for (const argv of [
      ["new", "--title", "-h", "--category", "bug"],
      ["new", "--category", "bug", "--title", "--", "-h"],
    ]) {
      expect(await run(argv)).toMatchObject({ code: EXIT.invalid, err: expect.stringContaining("--title=значение") });
    }
    expect((await run(["list", "--json", "-h"])).out).toMatch(/^Использование:\n {2}backlog list /);
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

  it.skipIf(process.platform === "win32")("язык не запомнился из-за каталога без записи — команда работает, а в stderr сказано, что и почему (на Windows chmod не закрывает каталог)", async () => {
    const { root, run } = await makeCliSandbox();
    await rm(settingsFilePath(root));
    await chmod(root, 0o500);
    onTestFinished(() => chmod(root, 0o700));

    const result = await run(["project", "list"], { env: { LANG: "ru_RU.UTF-8" } });

    expect(result.code).toBe(EXIT.ok);
    expect(result.err).toContain(`Не удалось сохранить язык в ${settingsFilePath(root)}: EACCES`);
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
    const missing = CLI_COMMANDS.filter(({ name }) => !rows.some((row) => row.startsWith(`| \`backlog ${name} `) || row.startsWith(`| \`backlog ${name}\``)));
    expect(missing.map(({ name }) => name)).toEqual([]);
  });
});

describe("commandName", () => {
  it("для хука Stop возвращает команду, по которой статистика отделяет запуски хука", () => {
    expect(commandName(["hook", HOOK_STOP_EVENT])).toBe(HOOK_STOP_COMMAND);
  });

  it("лишний аргумент хука — не запуск хука Stop: команда отклоняется и в статистику хука не попадает", () => {
    expect(commandName(["hook", HOOK_STOP_EVENT, "extra"])).toBe("hook");
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
