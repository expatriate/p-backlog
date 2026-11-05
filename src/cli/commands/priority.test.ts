import { readFile, writeFile } from "node:fs/promises";
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

  it("приоритет задачи эпика, чей файл не разобран, меняется, а не отклоняется «эпик не найден»", async () => {
    const { run, root } = await makeCliSandbox();
    await run(["new", "--title", "Эпик", "--type", "epic"]);
    await run(["new", "--category", "bug", "--title", "Задача эпика", "--epic", "SPA-1"]);
    await writeFile(join(root, "spa/SPA-1.md"), "---\nid: SPA-1\ntitle: [\n---\n", "utf8");

    expect(await run(["priority", "SPA-2", "low"])).toMatchObject({ code: EXIT.ok, out: "SPA-2: medium → low" });
  });

  it("неизвестный приоритет и лишние аргументы — код 1, нет задачи — код 2", async () => {
    const { run, root } = await makeCliSandbox();
    await run(["new", "--category", "bug", "--title", "X"]);

    expect((await run(["priority", "SPA-1", "urgent"])).code).toBe(EXIT.invalid);
    expect((await run(["priority", "SPA-1", "high", "low"])).code).toBe(EXIT.invalid);
    expect((await run(["priority", "SPA-9", "high"])).code).toBe(EXIT.notFound);
    expect((await loadBacklog(root)).tasks[0]?.priority).toBe("medium");
  });

  it("файл задачи не в UTF-8 не переписывается: кириллица в CP1251 остаётся байт в байт, причина названа", async () => {
    const { run, root } = await makeCliSandbox();
    await run(["new", "--category", "bug", "--title", "X"]);
    const path = join(root, "spa/SPA-1.md");
    const cp1251Body = Buffer.from([0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2, 0x0a]);
    await writeFile(path, Buffer.concat([await readFile(path), cp1251Body]));
    const before = await readFile(path);

    const result = await run(["priority", "SPA-1", "low"]);

    expect(result.code).not.toBe(EXIT.ok);
    expect(result.err).toContain("UTF-8");
    expect((await readFile(path)).equals(before)).toBe(true);
  });
});
