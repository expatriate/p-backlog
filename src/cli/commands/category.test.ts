import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadBacklog } from "../../core/store/load";
import { readJournal } from "../../core/store/journal";
import { makeCliSandbox } from "../testing/cli-harness";

describe("backlog category", () => {
  it("ставит и убирает категорию, пишет событие category", async () => {
    const { run, root } = await makeCliSandbox();
    await run(["new", "--category", "bug", "--title", "X"]);

    const set = await run(["category", "SPA-1", "couplers"]);
    const cleared = await run(["category", "SPA-1", "none"]);

    expect(set).toMatchObject({ code: 0, out: "SPA-1: Ошибка → Связанность" });
    expect(cleared).toMatchObject({ code: 0, out: "SPA-1: Связанность → не указана" });
    expect((await loadBacklog(root)).tasks[0]?.category).toBeUndefined();
    const kinds = (await readJournal(join(root, "spa"), "spa")).events.map((event) => event.kind);
    expect(kinds).toEqual(["created", "category", "category"]);
  });

  it("неизвестное значение — код 1, нет задачи — код 2, без аргументов — код 1", async () => {
    const { run } = await makeCliSandbox();
    await run(["new", "--category", "bug", "--title", "X"]);

    expect((await run(["category", "SPA-1", "spaghetti"])).code).toBe(1);
    expect((await run(["category", "SPA-9", "bug"])).code).toBe(2);
    expect((await run(["category", "SPA-1"])).code).toBe(1);
  });
});
