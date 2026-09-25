import { describe, expect, it } from "vitest";
import { loadBacklog } from "../../core/store/load";
import { EXIT } from "../io";
import { makeCliSandbox } from "../testing/cli-harness";

describe("backlog project", () => {
  it.each([
    [["list", "garbage"]],
    [["list", "--confirm", "x"]],
    [["status", "spa", "active", "--confirm", "spa"]],
  ])("лишние аргументы %j отклоняет кодом 1", async (argv) => {
    const { run } = await makeCliSandbox();

    expect((await run(["project", ...argv])).code).toBe(EXIT.invalid);
  });

  it("list печатает статус и число открытых, status переключает активность", async () => {
    const { run, home } = await makeCliSandbox();
    await run(["new", "--category", "bug", "--title", "Задача"]);

    expect((await run(["project", "list"])).out).toMatch(/^spa · .* · SPA · активен · открытых 1$/);

    expect(await run(["project", "status", "spa", "inactive"])).toMatchObject({ code: EXIT.ok, out: "spa: активен → неактивен" });
    expect((await run(["project", "list"])).out).toContain("неактивен");
    expect((await run(["list", "--all-projects"], { cwd: home })).out).toBe("Задач не найдено");

    expect(await run(["project", "status", "spa", "active"])).toMatchObject({ code: EXIT.ok, out: "spa: неактивен → активен" });
    expect((await run(["project", "status", "нет-такого", "active"])).code).toBe(EXIT.notFound);
    expect((await run(["project", "status", "spa", "включить"])).code).toBe(EXIT.invalid);
    expect((await run(["project", "чего"])).code).toBe(EXIT.invalid);
  });

  it("delete удаляет проект только с точным подтверждением", async () => {
    const { run, root } = await makeCliSandbox();
    await run(["new", "--category", "bug", "--title", "Задача"]);

    const noConfirm = await run(["project", "delete", "spa"]);
    expect(noConfirm).toMatchObject({ code: EXIT.invalid, err: "Подтвердите удаление: backlog project delete spa --confirm spa" });
    expect((await run(["project", "delete", "spa", "--confirm", "SPA"])).code).toBe(EXIT.invalid);
    expect((await loadBacklog(root)).projects).toHaveLength(1);

    expect(await run(["project", "delete", "spa", "--confirm", "spa"])).toMatchObject({ code: EXIT.ok, out: "spa удалён: задач 1" });
    expect((await loadBacklog(root)).projects).toEqual([]);
    expect((await run(["project", "delete", "spa", "--confirm", "spa"])).code).toBe(EXIT.notFound);
  });
});
