import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadBacklog } from "../../core/store/load";
import { readJournal } from "../../core/store/journal";
import { EXIT } from "../io";
import { makeCliSandbox } from "../testing/cli-harness";

describe("backlog status", () => {
  it("меняет статус и предупреждает о неотмеченных пунктах при done", async () => {
    const { run, root } = await makeCliSandbox();
    await run(["new", "--title", "X"], { stdin: "- [ ] a\n- [x] b" });

    const result = await run(["status", "SPA-1", "done"]);

    expect(result).toEqual({ code: EXIT.ok, out: "SPA-1: backlog → done", err: "Внимание: не отмечено пунктов чеклиста — 1" });
    expect((await loadBacklog(root)).tasks[0]?.status).toBe("done");
  });

  it("проверяет аргументы и существование задачи", async () => {
    const { run } = await makeCliSandbox();
    await run(["new", "--title", "X"]);
    expect((await run(["status", "SPA-1"])).code).toBe(EXIT.invalid);
    expect((await run(["status", "SPA-1", "later"])).code).toBe(EXIT.invalid);
    expect((await run(["status", "SPA-8", "done"])).code).toBe(EXIT.notFound);
  });

  it("создание и смена статуса через CLI попадают в журнал с источником cli", async () => {
    const { run, root } = await makeCliSandbox();
    await run(["new", "--title", "X", "--priority", "high"]);

    await run(["status", "SPA-1", "done"]);

    const journal = await readJournal(join(root, "spa"), "spa");
    expect(journal.events).toMatchObject([
      { kind: "created", task: "SPA-1", priority: "high", via: "cli" },
      { kind: "status", task: "SPA-1", from: "backlog", to: "done", via: "cli" },
    ]);
  });
});
