import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadBacklog } from "../../core/store/load";
import { readJournal } from "../../core/store/journal";
import { EXIT } from "../io";
import { commitIn, makeCliSandbox } from "../testing/cli-harness";

describe("backlog status", () => {
  it("меняет статус и предупреждает о неотмеченных пунктах при done", async () => {
    const { run, root } = await makeCliSandbox();
    await run(["new", "--category", "bug", "--title", "X"], { stdin: "- [ ] a\n- [x] b" });

    const result = await run(["status", "SPA-1", "done"]);

    expect(result).toEqual({
      code: EXIT.ok,
      out: "SPA-1: backlog → done",
      err: [
        "Внимание: не отмечено пунктов чеклиста — 1",
        'SPA-1 закрыта без коммита исправления — статистика не узнает, чем она исправлена. Когда правка будет в коммите: backlog close SPA-1 --as fixed --reason "Исправлено в <sha>: …"',
      ].join("\n"),
    });
    expect((await loadBacklog(root)).tasks[0]?.status).toBe("done");
  });

  it("возврат исправленной задачи в работу называет её прежние коммиты", async () => {
    const { run, repo } = await makeCliSandbox();
    await run(["new", "--category", "bug", "--title", "X"]);
    const sha = await commitIn(repo);
    await run(["close", "SPA-1", "--as", "fixed", "--reason", `Исправлено в ${sha}: таймаут`]);

    const reopened = await run(["status", "SPA-1", "in-progress"]);

    expect(reopened).toEqual({
      code: EXIT.ok,
      out: "SPA-1: done → in-progress",
      err: `SPA-1 была исправлена в ${sha}: закрывая снова, укажите в --reason и эти коммиты — иначе статистика не учтёт первое исправление`,
    });
  });

  it("сообщает, что эпик, закрытый сам, снова открыт, когда его задачу открыли", async () => {
    const { run, root } = await makeCliSandbox();
    await run(["new", "--type", "epic", "--title", "Эпик"]);
    await run(["new", "--category", "bug", "--title", "Задача эпика", "--epic", "SPA-1"]);
    await run(["status", "SPA-2", "done"]);
    await run(["check"]);
    expect((await loadBacklog(root)).tasks[0]).toMatchObject({ status: "done", resolution: "epic-done" });

    const reopened = await run(["status", "SPA-2", "backlog"]);

    expect(reopened).toEqual({ code: EXIT.ok, out: "SPA-2: done → backlog", err: "Эпик SPA-1 снова открыт — в нём появилась открытая задача" });
    expect((await loadBacklog(root)).tasks[0]?.status).toBe("backlog");
  });

  it("проверяет аргументы и существование задачи", async () => {
    const { run } = await makeCliSandbox();
    await run(["new", "--category", "bug", "--title", "X"]);
    expect((await run(["status", "SPA-1"])).code).toBe(EXIT.invalid);
    expect((await run(["status", "SPA-1", "later"])).code).toBe(EXIT.invalid);
    expect((await run(["status", "SPA-8", "done"])).code).toBe(EXIT.notFound);
  });

  it("создание и смена статуса через CLI попадают в журнал с источником cli", async () => {
    const { run, root } = await makeCliSandbox();
    await run(["new", "--category", "bug", "--title", "X", "--priority", "high"]);

    await run(["status", "SPA-1", "done"]);

    const journal = await readJournal(join(root, "spa"), "spa");
    expect(journal.events).toMatchObject([
      { kind: "created", task: "SPA-1", priority: "high", via: "cli" },
      { kind: "status", task: "SPA-1", from: "backlog", to: "done", via: "cli" },
    ]);
  });
});
