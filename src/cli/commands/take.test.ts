import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadBacklog } from "../../core/store/load";
import { updateTask } from "../../core/store/testing/update-task";
import { EXIT } from "../io";
import { makeCliSandbox } from "../testing/cli-harness";

async function statusOf(root: string, id: string): Promise<string | undefined> {
  return (await loadBacklog(root)).tasks.find((task) => task.id === id)?.status;
}

describe("backlog take", () => {
  it("берёт задачу по ID и ставит in-progress, повторный take не падает", async () => {
    const { run, root } = await makeCliSandbox();
    await run(["new", "--category", "bug", "--title", "Задача"]);

    const result = await run(["take", "SPA-1"]);

    expect(result.code).toBe(EXIT.ok);
    expect(result.out).toContain("Статус: in-progress");
    expect(await statusOf(root, "SPA-1")).toBe("in-progress");
    expect((await run(["take", "SPA-1"])).code).toBe(EXIT.ok);
  });

  it("отказывает при открытых блокерах, берёт с --force", async () => {
    const { run, root } = await makeCliSandbox();
    await run(["new", "--category", "bug", "--title", "Блокер"]);
    await run(["new", "--category", "bug", "--title", "Зависимая", "--blocked-by", "SPA-1"]);

    const refused = await run(["take", "SPA-2"]);

    expect(refused.code).toBe(EXIT.refused);
    expect(refused.err).toContain("SPA-1 — Блокер (backlog)");
    expect(await statusOf(root, "SPA-2")).toBe("backlog");
    expect((await run(["take", "SPA-2", "--force"])).code).toBe(EXIT.ok);
  });

  it("отказывает для закрытой задачи и для эпика, перечисляя открытые задачи эпика", async () => {
    const { run, root } = await makeCliSandbox();
    await run(["new", "--title", "Эпик", "--type", "epic"]);
    await run(["new", "--category", "bug", "--title", "Часть", "--epic", "SPA-1"]);
    await updateTask(root, { id: "SPA-2", changes: { status: "cancelled" }, now: new Date(), via: "cli" });
    await run(["new", "--category", "bug", "--title", "Ещё часть", "--epic", "SPA-1"]);

    const epic = await run(["take", "SPA-1"]);

    expect(epic.code).toBe(EXIT.invalid);
    expect(epic.err).toContain("SPA-3 — Ещё часть");
    expect(epic.err).not.toContain("SPA-2");
    expect((await run(["take", "SPA-2"])).code).toBe(EXIT.refused);
    expect((await run(["take", "SPA-9"])).code).toBe(EXIT.notFound);
  });

  it("--next выбирает незаблокированную задачу с высшим приоритетом", async () => {
    const { run, root, home } = await makeCliSandbox();
    await run(["new", "--category", "bug", "--title", "Блокер", "--priority", "low"]);
    await run(["new", "--category", "bug", "--title", "Критичная, но заблокирована", "--priority", "critical", "--blocked-by", "SPA-1"]);
    await run(["new", "--category", "bug", "--title", "Высокая", "--priority", "high"]);

    const result = await run(["take", "--next"]);

    expect(result.code).toBe(EXIT.ok);
    expect(result.out).toContain("SPA-3 · Высокая");
    expect(await statusOf(root, "SPA-3")).toBe("in-progress");
    expect((await run(["take", "--next", "--project", "spa"], { cwd: home })).out).toContain("SPA-1 · Блокер");
    expect((await run(["take", "--next"])).code).toBe(EXIT.refused);
    expect((await run(["take", "--next"], { cwd: home })).code).toBe(EXIT.notFound);
    expect((await run(["take", "SPA-1", "--next"])).code).toBe(EXIT.invalid);
  });

  it("--path берёт все открытые задачи внутри пути, заблокированные пропускает", async () => {
    const { run, root } = await makeCliSandbox();
    await run(["new", "--category", "bug", "--title", "Первая в stats", "--source", "src/web/stats/A.tsx:3"]);
    await run(["new", "--category", "bug", "--title", "Вторая в stats", "--source", "src/web/stats/B.tsx:9"]);
    await run(["new", "--category", "bug", "--title", "Заблокированная в stats", "--source", "src/web/stats/C.tsx:1", "--blocked-by", "SPA-4"]);
    await run(["new", "--category", "bug", "--title", "Где-то ещё", "--source", "src/web/list/L.tsx:1"]);

    const result = await run(["take", "--path", "./src/web/stats/"]);

    expect(result.code).toBe(EXIT.ok);
    expect(result.out).toContain("Первая в stats");
    expect(result.out).toContain("Вторая в stats");
    expect(result.out).toContain("\n---\n");
    expect(result.err).toContain("SPA-3 заблокирована открытыми задачами");
    expect([await statusOf(root, "SPA-1"), await statusOf(root, "SPA-2"), await statusOf(root, "SPA-3"), await statusOf(root, "SPA-4")]).toEqual(["in-progress", "in-progress", "backlog", "backlog"]);
    expect(await run(["take", "--path", "src/server"])).toMatchObject({ code: EXIT.notFound, err: "Открытых задач по src/server нет" });
  });

  it("--path показывает связи с актуальными статусами задач, взятых той же командой", async () => {
    const { run } = await makeCliSandbox();
    await run(["new", "--category", "bug", "--title", "Первая", "--source", "src/a.ts:1"]);
    await run(["new", "--category", "bug", "--title", "Вторая", "--source", "src/b.ts:1", "--related", "SPA-1"]);

    const result = await run(["take", "--path", "src", "--json"]);

    const [, second] = result.out.split("\n---\n").map((text) => JSON.parse(text) as { relatedTasks: { id: string; status: string }[] });
    expect(second?.relatedTasks).toEqual([{ id: "SPA-1", title: "Первая", status: "in-progress" }]);
  });

  it("--path после неудачной записи одной задачи берёт остальные и отдаёт по блоку на каждую взятую", async () => {
    const { run, root } = await makeCliSandbox();
    await run(["new", "--category", "bug", "--title", "Первая", "--source", "src/a.ts:1"]);
    await run(["new", "--category", "bug", "--title", "Битая", "--source", "src/b.ts:1"]);
    await run(["new", "--category", "bug", "--title", "Третья", "--source", "src/c.ts:1"]);
    const broken = join(root, "spa", "SPA-2.md");
    await writeFile(broken, (await readFile(broken, "utf8")).replace("\n---\n", "\nepic: SPA-99\n---\n"));

    const result = await run(["take", "--path", "src", "--json"]);

    expect(result.code).not.toBe(EXIT.ok);
    expect([await statusOf(root, "SPA-1"), await statusOf(root, "SPA-2"), await statusOf(root, "SPA-3")]).toEqual(["in-progress", "backlog", "in-progress"]);
    expect(result.out.split("\n---\n").map((text) => (JSON.parse(text) as { id: string }).id)).toEqual(["SPA-1", "SPA-3"]);
  });

  it("--path понимает путь от текущего каталога, а не только от корня репозитория", async () => {
    const { run, root, repo } = await makeCliSandbox();
    await run(["new", "--category", "bug", "--title", "В stats", "--source", "src/web/stats/A.tsx:3"]);
    await run(["new", "--category", "bug", "--title", "В list", "--source", "src/web/list/L.tsx:1"]);
    await mkdir(join(repo, "src/web"), { recursive: true });

    expect((await run(["take", "--path", "stats"], { cwd: join(repo, "src/web") })).code).toBe(EXIT.ok);
    expect([await statusOf(root, "SPA-1"), await statusOf(root, "SPA-2")]).toEqual(["in-progress", "backlog"]);

    expect((await run(["take", "--path", "."])).code).toBe(EXIT.ok);
    expect(await statusOf(root, "SPA-2")).toBe("in-progress");
  });

  it("режимы не сочетаются, а «все заблокированы» отличается от «нет задач»", async () => {
    const { run } = await makeCliSandbox();
    await run(["new", "--category", "bug", "--title", "Блокер", "--source", "src/b.ts:1"]);
    await run(["new", "--category", "bug", "--title", "Зависимая", "--blocked-by", "SPA-1", "--source", "src/a.ts:2"]);

    expect((await run(["take", "--next", "--path", "src/a.ts"])).code).toBe(EXIT.invalid);
    expect((await run(["take", "SPA-2", "--path", "src/a.ts"])).code).toBe(EXIT.invalid);
    expect((await run(["take", "--path", "src/a.ts"])).code).toBe(EXIT.refused);
    expect((await run(["take", "--path", "нет-такого"])).code).toBe(EXIT.notFound);
  });
});
