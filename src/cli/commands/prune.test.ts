import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadBacklog } from "../../core/store/load";
import { EXIT, type CliIo } from "../io";
import { makeCliSandbox } from "../testing/cli-harness";
import { pruneCommand } from "./prune";

const LONG_AGO = new Date("2026-08-01T10:00:00Z");

describe("backlog prune", () => {
  it("показывает старые задачи с низким приоритетом, --apply отменяет только их", async () => {
    const { run, root } = await makeCliSandbox();
    await run(["new", "--category", "bug", "--title", "Старая мелочь", "--priority", "low"], { now: LONG_AGO });
    await run(["new", "--category", "bug", "--title", "Старая важная", "--priority", "high"], { now: LONG_AGO });
    await run(["new", "--category", "bug", "--title", "Свежая мелочь", "--priority", "low"]);

    const preview = await run(["prune"]);

    expect(preview).toMatchObject({ code: EXIT.ok, out: "SPA-1 — Старая мелочь (создана 01.08)\nОтменить: backlog prune --apply" });
    expect((await loadBacklog(root)).tasks.every((task) => task.status === "backlog")).toBe(true);

    const applied = await run(["prune", "--apply"]);

    expect(applied).toMatchObject({ code: EXIT.ok, out: "SPA-1: отменена" });
    const tasks = (await loadBacklog(root)).tasks;
    expect(tasks.find((task) => task.id === "SPA-1")).toMatchObject({ status: "cancelled", resolution: "obsolete", reason: "Низкий приоритет, не брали в работу 30+ дней (backlog prune)" });
    expect(tasks.filter((task) => task.status === "backlog").map((task) => task.id)).toEqual(["SPA-2", "SPA-3"]);
    expect((await run(["prune"])).out).toBe("Застоявшихся задач нет");
  });

  it("--apply после конфликта на одной задаче отменяет остальные и возвращает код ошибки", async () => {
    const { run, root, home, repo } = await makeCliSandbox();
    for (const title of ["Первая", "Вторая", "Третья"]) await run(["new", "--category", "bug", "--title", title, "--priority", "low"], { now: LONG_AGO });
    const err: string[] = [];
    const io: CliIo = {
      cwd: repo,
      home,
      backlogRoot: root,
      repoRoot: root,
      env: {},
      now: () => new Date("2026-09-17T14:50:00Z"),
      readStdin: async () => "",
      print: (line) => {
        if (line === "SPA-1: отменена") appendFileSync(join(root, "spa", "SPA-2.md"), "Правка руками во время prune\n");
      },
      warn: (line) => err.push(line),
      language: "ru",
    };

    const code = await pruneCommand.run(["--apply"], io);

    expect(code).toBe(EXIT.invalid);
    expect(err).toEqual(["Файл задачи SPA-2 изменился во время записи, повторите команду"]);
    const statuses = (await loadBacklog(root)).tasks.map((task) => [task.id, task.status]);
    expect(statuses).toEqual([
      ["SPA-1", "cancelled"],
      ["SPA-2", "backlog"],
      ["SPA-3", "cancelled"],
    ]);
  });
});
