import { describe, expect, it } from "vitest";
import { loadBacklog } from "../../core/store/load";
import { updateTask } from "../../core/store/update";
import { EXIT } from "../io";
import { makeCliSandbox } from "../testing/cli-harness";

async function statusOf(root: string, id: string): Promise<string | undefined> {
  return (await loadBacklog(root)).tasks.find((task) => task.id === id)?.status;
}

describe("backlog take", () => {
  it("берёт задачу по ID и ставит in-progress, повторный take не падает", async () => {
    const { run, root } = await makeCliSandbox();
    await run(["new", "--title", "Задача"]);

    const result = await run(["take", "SPA-1"]);

    expect(result.code).toBe(EXIT.ok);
    expect(result.out).toContain("Статус: in-progress");
    expect(await statusOf(root, "SPA-1")).toBe("in-progress");
    expect((await run(["take", "SPA-1"])).code).toBe(EXIT.ok);
  });

  it("отказывает при открытых блокерах, берёт с --force", async () => {
    const { run, root } = await makeCliSandbox();
    await run(["new", "--title", "Блокер"]);
    await run(["new", "--title", "Зависимая", "--blocked-by", "SPA-1"]);

    const refused = await run(["take", "SPA-2"]);

    expect(refused.code).toBe(EXIT.refused);
    expect(refused.err).toContain("SPA-1 — Блокер (backlog)");
    expect(await statusOf(root, "SPA-2")).toBe("backlog");
    expect((await run(["take", "SPA-2", "--force"])).code).toBe(EXIT.ok);
  });

  it("отказывает для закрытой задачи и для эпика, перечисляя открытые задачи эпика", async () => {
    const { run, root } = await makeCliSandbox();
    await run(["new", "--title", "Эпик", "--type", "epic"]);
    await run(["new", "--title", "Часть", "--epic", "SPA-1"]);
    await updateTask(root, { id: "SPA-2", changes: { status: "cancelled" }, now: new Date(), via: "cli" });
    await run(["new", "--title", "Ещё часть", "--epic", "SPA-1"]);

    const epic = await run(["take", "SPA-1"]);

    expect(epic.code).toBe(EXIT.invalid);
    expect(epic.err).toContain("SPA-3 — Ещё часть");
    expect(epic.err).not.toContain("SPA-2");
    expect((await run(["take", "SPA-2"])).code).toBe(EXIT.refused);
    expect((await run(["take", "SPA-9"])).code).toBe(EXIT.notFound);
  });

  it("--next выбирает незаблокированную задачу с высшим приоритетом", async () => {
    const { run, root, home } = await makeCliSandbox();
    await run(["new", "--title", "Блокер", "--priority", "low"]);
    await run(["new", "--title", "Критичная, но заблокирована", "--priority", "critical", "--blocked-by", "SPA-1"]);
    await run(["new", "--title", "Высокая", "--priority", "high"]);

    const result = await run(["take", "--next"]);

    expect(result.code).toBe(EXIT.ok);
    expect(result.out).toContain("SPA-3 · Высокая");
    expect(await statusOf(root, "SPA-3")).toBe("in-progress");
    expect((await run(["take", "--next", "--project", "spa"], { cwd: home })).out).toContain("SPA-1 · Блокер");
    expect((await run(["take", "--next"])).code).toBe(EXIT.notFound);
    expect((await run(["take", "--next"], { cwd: home })).code).toBe(EXIT.notFound);
    expect((await run(["take", "SPA-1", "--next"])).code).toBe(EXIT.invalid);
  });
});
