import { describe, expect, it } from "vitest";
import { EXIT } from "../io";
import { makeCliSandbox } from "../testing/cli-harness";

describe("backlog stats", () => {
  it("сводка проекта с тревогами и ссылкой", async () => {
    const { run } = await makeCliSandbox();
    await run(["new", "--title", "Упало", "--priority", "critical"], { now: new Date("2026-09-01T10:00:00Z") });
    await run(["new", "--title", "Ещё"]);

    const result = await run(["stats"]);

    expect(result.code).toBe(EXIT.ok);
    expect(result.out.split("\n")).toEqual([
      "spa · статистика",
      "Открыто: 2 (вес 10) · за неделю: +1 (создано 1, закрыто 0)",
      "Возраст, медиана: 8 дн. · до закрытия, медиана: —",
      "Прогноз: Долг растёт на 0,5 задач в неделю (за 4 недели: закрыто 0, создано 2)",
      "Тревоги:",
      "- Срочные задачи ждут дольше 7 дней: 1",
      "Подробнее: http://localhost:4317/p/spa/stats",
    ]);
  });

  it("все проекты без тревог и JSON", async () => {
    const { run } = await makeCliSandbox();
    await run(["new", "--title", "Одна"]);

    const text = await run(["stats", "--all-projects"]);
    const json = JSON.parse((await run(["stats", "--json"])).out) as { totals: { open: number }; forecast: { created: number }; signals: unknown[] };

    expect(text.out).toContain("Все проекты · статистика");
    expect(text.out).toContain("Тревог нет");
    expect(text.out).toContain("Подробнее: http://localhost:4317/stats");
    expect(json).toMatchObject({ totals: { open: 1 }, forecast: { created: 1 }, signals: [] });
  });

  it("ошибки области", async () => {
    const { run, home } = await makeCliSandbox();

    expect((await run(["stats", "--project", "spa", "--all-projects"])).code).toBe(EXIT.invalid);
    expect((await run(["stats"], { cwd: home })).code).toBe(EXIT.notFound);
  });
});
