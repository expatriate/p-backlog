import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadBacklog } from "../../core/store/load";
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
});
