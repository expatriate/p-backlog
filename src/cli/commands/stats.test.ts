import { describe, expect, it } from "vitest";
import { EXIT } from "../io";
import { makeCliSandbox } from "../testing/cli-harness";
import { projectFile, taskFile, writeFiles } from "../../core/store/testing/temp-dirs";
import { NBSP } from "../../core/i18n/plural";
import { writeSettings } from "../../core/store/settings";

describe("backlog stats", () => {
  it("сводка проекта с тревогами и ссылкой", async () => {
    const { run } = await makeCliSandbox();
    await run(["new", "--category", "bug", "--title", "Упало", "--priority", "critical"], { now: new Date("2026-09-01T10:00:00Z") });
    await run(["new", "--category", "bug", "--title", "Ещё"]);

    const result = await run(["stats"]);

    expect(result.code).toBe(EXIT.ok);
    expect(result.out.split("\n")).toEqual([
      "spa · статистика",
      "Открыто: 2 (вес 10) · за неделю: +1 (создано 1, закрыто 0)",
      `Возраст, медиана: 8${NBSP}дн. · до закрытия, медиана: —`,
      `Прогноз: Долг растёт на 0,7${NBSP}задачи в неделю (за 3${NBSP}недели: закрыто 0, создано 2)`,
      "Тревоги:",
      "- Срочные задачи ждут дольше 7 дней: 1",
      "Подробнее: http://localhost:4317/p/spa/stats",
    ]);
  });

  it("на языке en сроки, прогноз и тревоги без кириллицы", async () => {
    const { run, root } = await makeCliSandbox();
    await writeSettings(root, { language: "en" });
    await run(["new", "--category", "bug", "--title", "Crash", "--priority", "critical"], { now: new Date("2026-09-01T10:00:00Z") });
    await run(["new", "--category", "bug", "--title", "Fixed"], { now: new Date("2026-09-14T10:00:00Z") });
    await run(["status", "SPA-2", "done"]);

    const result = await run(["stats"]);

    expect(result.out).toContain(`Age, median: 16${NBSP}days · time to close, median: 3${NBSP}days (90% — within 3${NBSP}days)`);
    expect(result.out).not.toMatch(/[А-Яа-яЁё]/);
  });

  it("все проекты без тревог и JSON", async () => {
    const { run } = await makeCliSandbox();
    await run(["new", "--category", "bug", "--title", "Одна"]);

    const text = await run(["stats", "--all-projects"]);
    const json = JSON.parse((await run(["stats", "--json"])).out) as { totals: { open: number }; forecast: { created: number }; signals: unknown[] };

    expect(text.out).toContain("Проекты · статистика");
    expect(text.out).toContain("Тревог нет");
    expect(text.out).toContain("Подробнее: http://localhost:4317/stats");
    expect(json).toMatchObject({ totals: { open: 1 }, forecast: { created: 1 }, signals: [] });
  });

  it("ошибки области", async () => {
    const { run, home } = await makeCliSandbox();

    expect((await run(["stats", "--project", "spa", "--all-projects"])).code).toBe(EXIT.invalid);
    expect((await run(["stats"], { cwd: home })).code).toBe(EXIT.notFound);
  });

  it("--all-projects не считает неактивные проекты", async () => {
    const { run, root, home } = await makeCliSandbox();
    await run(["new", "--category", "bug", "--title", "Активная"]);
    await writeFiles(root, { "ti/project.md": projectFile("TI", [], { active: false }), "ti/TI-1.md": taskFile("TI-1") });

    const all = JSON.parse((await run(["stats", "--all-projects", "--json"], { cwd: home })).out) as { totals: { open: number } };

    expect(all.totals.open).toBe(1);
  });
});
