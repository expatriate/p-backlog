import { describe, expect, it } from "vitest";
import { writeFiles } from "../../core/store/testing/temp-dirs";
import { updateTask } from "../../core/store/update";
import { EXIT } from "../io";
import { makeCliSandbox } from "../testing/cli-harness";

describe("backlog list", () => {
  it("по умолчанию показывает открытые задачи текущего проекта по приоритету", async () => {
    const { run, root } = await makeCliSandbox();
    await run(["new", "--title", "Низкий", "--priority", "low", "--tags", "ui"]);
    await run(["new", "--title", "Критичный", "--priority", "critical"]);
    await run(["new", "--title", "Закрытый"]);
    await updateTask(root, { id: "SPA-3", changes: { status: "done" } });

    const result = await run(["list"]);

    expect(result.code).toBe(EXIT.ok);
    expect(result.out.split("\n").map((line) => line.split(/\s+/)[0])).toEqual(["SPA-2", "SPA-1"]);
    expect((await run(["list", "--status", "done"])).out).toContain("Закрытый");
    expect((await run(["list", "--tag", "UI"])).out).toContain("Низкий");
    expect((await run(["list", "--query", "критичн"])).out).not.toContain("Низкий");
    expect((await run(["list", "--query", "нет такого"])).out).toBe("Задач не найдено");
  });

  it("вне проекта требует --project или --all-projects и выводит ошибки разбора", async () => {
    const { run, home, root } = await makeCliSandbox();
    await run(["new", "--title", "X"]);
    await writeFiles(root, { "spa/SPA-9.md": "сломано" });

    expect((await run(["list"], { cwd: home })).code).toBe(EXIT.notFound);
    const all = await run(["list", "--all-projects"], { cwd: home });
    expect(all.code).toBe(EXIT.ok);
    expect(all.out).toContain("SPA-1");
    expect(all.err).toContain("SPA-9.md");
    expect((await run(["list", "--project", "spa", "--all-projects"])).code).toBe(EXIT.invalid);
  });
});
