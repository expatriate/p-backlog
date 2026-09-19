import { describe, expect, it } from "vitest";
import { writeFiles } from "../../core/store/testing/temp-dirs";
import { EXIT } from "../io";
import { makeCliSandbox } from "../testing/cli-harness";

describe("backlog show", () => {
  it("показывает прогресс, связи, предупреждения и содержимое файла", async () => {
    const { run } = await makeCliSandbox();
    await run(["new", "--title", "Эпик", "--type", "epic"]);
    await run(["new", "--category", "bug", "--title", "Блокер"]);
    await run(["new", "--category", "bug", "--title", "Основная", "--epic", "SPA-1", "--blocked-by", "SPA-2,SPA-77"], { stdin: "- [x] a\n- [ ] b" });

    const result = await run(["show", "SPA-3"]);

    expect(result.code).toBe(EXIT.ok);
    expect(result.out).toContain("SPA-3 · Основная");
    expect(result.out).toContain("Прогресс: 50%");
    expect(result.out).toContain("Эпик: SPA-1 — Эпик (backlog)");
    expect(result.out).toContain("Открытые блокеры: SPA-2 — Блокер (backlog)");
    expect(result.out).toContain("Предупреждения: SPA-77 не найдена");
    expect(result.out).toContain("- [ ] b");
    expect((await run(["show", "SPA-2"])).out).toContain("Блокирует: SPA-3 — Основная");
    expect(JSON.parse((await run(["show", "SPA-1", "--json"])).out)).toMatchObject({ progress: 0, children: [{ id: "SPA-3" }] });
  });

  it("показывает категорию в строке типа и статуса", async () => {
    const { run } = await makeCliSandbox();
    await run(["new", "--title", "X", "--category", "bug"]);

    expect((await run(["show", "SPA-1"])).out).toContain("· Категория: Ошибка");
  });

  it("сообщает о ненайденной и о неразобранной задаче", async () => {
    const { run, root } = await makeCliSandbox();
    await run(["new", "--category", "bug", "--title", "X"]);
    await writeFiles(root, { "spa/SPA-5.md": "сломано" });
    expect(await run(["show", "SPA-4"])).toMatchObject({ code: EXIT.notFound, err: "Задача SPA-4 не найдена" });
    expect((await run(["show", "SPA-5"])).err).toContain("Файл задачи SPA-5 не разобран");
    expect((await run(["show"])).code).toBe(EXIT.invalid);
  });
});
