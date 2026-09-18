import { execFileSync } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadBacklog } from "../../core/store/load";
import { readJournal } from "../../core/store/journal";
import { gitCommitAll, writeFiles } from "../../core/store/testing/temp-dirs";
import { EXIT } from "../io";
import { makeCliSandbox } from "../testing/cli-harness";

describe("backlog new", () => {
  it("создаёт проект по git-корню и задачу с описанием из stdin", async () => {
    const { run, root, repo } = await makeCliSandbox();
    await mkdir(join(repo, "src"));

    const result = await run(
      ["new", "--title", "Таймауты загрузки", "--priority", "high", "--tags", "upload, network", "--source", "src/a.ts:10"],
      { cwd: join(repo, "src"), stdin: "Описание\n\n## Чеклист\n- [ ] шаг\n" },
    );

    expect(result).toEqual({ code: EXIT.ok, out: `SPA-1 ${join(root, "spa/SPA-1.md")}`, err: "Создан проект spa (SPA)" });
    const text = await readFile(join(root, "spa/SPA-1.md"), "utf8");
    expect(text).toContain("tags: [upload, network]");
    expect(text).toContain("source: src/a.ts:10");
    expect(text).toContain("- [ ] шаг");
    expect((await loadBacklog(root)).projects[0]?.repos).toEqual([repo]);
  });

  it("второй вызов использует существующий проект, --json печатает задачу", async () => {
    const { run } = await makeCliSandbox();
    await run(["new", "--title", "Первая"]);

    const result = await run(["new", "--title", "Вторая", "--related", "SPA-1", "--json"]);

    expect(result.code).toBe(EXIT.ok);
    expect(result.err).toBe("");
    expect(JSON.parse(result.out)).toMatchObject({ id: "SPA-2", related: ["SPA-1"], projectId: "spa" });
  });

  it("ошибки аргументов и правил — код 1, неизвестный --project — код 2", async () => {
    const { run } = await makeCliSandbox();
    expect((await run(["new"])).code).toBe(EXIT.invalid);
    expect((await run(["new", "--title", "X", "--priority", "urgent"])).err).toContain("--priority");
    expect((await run(["new", "--title", "X", "--unknown"])).code).toBe(EXIT.invalid);
    expect(await run(["new", "--title", "X", "--epic", "SPA-40"])).toMatchObject({
      code: EXIT.invalid,
      err: expect.stringContaining("эпик SPA-40 не найден"),
    });
    expect((await run(["new", "--title", "X", "--project", "nope"])).code).toBe(EXIT.notFound);
  });

  it("категория, как найдена и происхождение попадают в файл и журнал", async () => {
    const { run, root, repo } = await makeCliSandbox();
    await writeFiles(repo, { "a.ts": "x" });
    gitCommitAll(repo, "начало", "2026-09-17T10:00:00+03:00");
    const branch = execFileSync("git", ["-C", repo, "rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8" }).trim();
    const commit = execFileSync("git", ["-C", repo, "rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();

    const result = await run(["new", "--title", "X", "--category", "couplers", "--found", "review"]);

    expect(result.code).toBe(0);
    const [created] = (await readJournal(join(root, "spa"), "spa")).events;
    expect(created).toMatchObject({ kind: "created", category: "couplers", found: "review", origin: { branch, commit } });
  });

  it("без коммитов происхождения нет, по умолчанию — найдена попутно", async () => {
    const { run, root } = await makeCliSandbox();

    await run(["new", "--title", "X"]);

    const [created] = (await readJournal(join(root, "spa"), "spa")).events;
    expect(created).toMatchObject({ kind: "created", found: "incidental" });
    expect(created).not.toHaveProperty("origin");
    expect(created).not.toHaveProperty("category");
  });

  it("вне git происхождения нет", async () => {
    const { run, root, home } = await makeCliSandbox();
    await run(["new", "--title", "Первая"]);

    await run(["new", "--title", "Вторая", "--project", "spa"], { cwd: home });

    const events = (await readJournal(join(root, "spa"), "spa")).events;
    expect(events[1]).not.toHaveProperty("origin");
  });

  it("неизвестные категория и «как найдена» — код 1", async () => {
    const { run } = await makeCliSandbox();

    expect((await run(["new", "--title", "X", "--category", "spaghetti"])).code).toBe(1);
    expect((await run(["new", "--title", "X", "--found", "maybe"])).code).toBe(1);
  });
});
