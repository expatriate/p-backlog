import { describe, expect, it } from "vitest";
import { loadBacklog } from "../../core/store/load";
import { EXIT } from "../io";
import { makeCliSandbox } from "../testing/cli-harness";

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
});
