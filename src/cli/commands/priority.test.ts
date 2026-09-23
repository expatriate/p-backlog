import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadBacklog } from "../../core/store/load";
import { readJournal } from "../../core/store/journal";
import { EXIT } from "../io";
import { makeCliSandbox } from "../testing/cli-harness";

describe("backlog priority", () => {
  it("меняет приоритет и пишет событие priority для статистики", async () => {
    const { run, root } = await makeCliSandbox();
    await run(["new", "--category", "bug", "--title", "X"]);

    expect(await run(["priority", "SPA-1", "critical"])).toMatchObject({ code: EXIT.ok, out: "SPA-1: medium → critical" });
    expect((await loadBacklog(root)).tasks[0]?.priority).toBe("critical");
    const events = (await readJournal(join(root, "spa"), "spa")).events;
    expect(events.at(-1)).toMatchObject({ kind: "priority", task: "SPA-1", from: "medium", to: "critical", via: "cli" });
  });

  it("неизвестный приоритет и лишние аргументы — код 1, нет задачи — код 2", async () => {
    const { run, root } = await makeCliSandbox();
    await run(["new", "--category", "bug", "--title", "X"]);

    expect((await run(["priority", "SPA-1", "urgent"])).code).toBe(EXIT.invalid);
    expect((await run(["priority", "SPA-1", "high", "low"])).code).toBe(EXIT.invalid);
    expect((await run(["priority", "SPA-9", "high"])).code).toBe(EXIT.notFound);
    expect((await loadBacklog(root)).tasks[0]?.priority).toBe("medium");
  });
});
