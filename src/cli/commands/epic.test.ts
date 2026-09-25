import { describe, expect, it } from "vitest";
import { loadBacklog } from "../../core/store/load";
import { projectFile, taskFile, writeFiles } from "../../core/store/testing/temp-dirs";
import { EXIT } from "../io";
import { makeCliSandbox } from "../testing/cli-harness";

describe("backlog epic", () => {
  it("переносит несколько задач в эпик и вынимает обратно", async () => {
    const { run, root } = await makeCliSandbox();
    await run(["new", "--type", "epic", "--title", "Большой кусок"]);
    await run(["new", "--category", "bug", "--title", "Первая"]);
    await run(["new", "--category", "bug", "--title", "Вторая"]);

    const moved = await run(["epic", "SPA-2", "SPA-3", "--to", "SPA-1"]);

    expect(moved).toMatchObject({ code: EXIT.ok, out: "SPA-2: без эпика → SPA-1\nSPA-3: без эпика → SPA-1" });
    expect((await loadBacklog(root)).tasks.map((task) => task.epic)).toEqual([undefined, "SPA-1", "SPA-1"]);

    const cleared = await run(["epic", "SPA-2", "--to", "none"]);

    expect(cleared).toMatchObject({ code: EXIT.ok, out: "SPA-2: SPA-1 → без эпика" });
    expect((await loadBacklog(root)).tasks.find((task) => task.id === "SPA-2")?.epic).toBeUndefined();
  });

  it("отказывает на не-эпике, чужом ID и эпике внутри эпика", async () => {
    const { run, root } = await makeCliSandbox();
    await run(["new", "--type", "epic", "--title", "Эпик"]);
    await run(["new", "--category", "bug", "--title", "Задача"]);
    await run(["new", "--type", "epic", "--title", "Другой эпик"]);

    expect((await run(["epic", "SPA-2", "--to", "SPA-2"])).code).toBe(EXIT.invalid);
    expect((await run(["epic", "SPA-2", "--to", "SPA-40"])).code).toBe(EXIT.notFound);
    expect((await run(["epic", "SPA-40", "--to", "SPA-1"])).code).toBe(EXIT.notFound);
    expect(await run(["epic", "SPA-3", "--to", "SPA-1"])).toMatchObject({ code: EXIT.invalid, err: "SPA-3 — эпик, эпик не может входить в другой эпик" });
    expect((await run(["epic", "SPA-2"])).code).toBe(EXIT.invalid);
    expect((await run(["epic", "--to", "SPA-1"])).code).toBe(EXIT.invalid);

    expect((await loadBacklog(root)).tasks.every((task) => task.epic === undefined)).toBe(true);
  });

  it("отказывает на эпике другого проекта", async () => {
    const { run, root } = await makeCliSandbox();
    await run(["new", "--category", "bug", "--title", "Задача"]);
    await writeFiles(root, { "ti/project.md": projectFile("TI"), "ti/TI-1.md": taskFile("TI-1", "type: epic\n") });

    expect(await run(["epic", "SPA-1", "--to", "TI-1"])).toMatchObject({ code: EXIT.invalid, err: expect.stringContaining("эпик TI-1 из другого проекта") });
    expect((await loadBacklog(root)).tasks.find((task) => task.id === "SPA-1")?.epic).toBeUndefined();
  });

  it("эпик другого проекта, записанный раньше, не мешает загрузке, виден в check и снимается через --to none", async () => {
    const { run, root, repo } = await makeCliSandbox();
    await writeFiles(root, {
      "spa/project.md": projectFile("SPA", [repo]),
      "spa/SPA-1.md": taskFile("SPA-1", "epic: TI-1\n"),
      "ti/project.md": projectFile("TI"),
      "ti/TI-1.md": taskFile("TI-1", "type: epic\n"),
    });

    expect((await loadBacklog(root)).errors).toEqual([]);
    expect(await run(["check"])).toMatchObject({ code: EXIT.needsReview, out: "Проблемы:\n  SPA-1: эпик TI-1 из другого проекта — снимите эпик или выберите эпик этого проекта" });

    expect(await run(["epic", "SPA-1", "--to", "none"])).toMatchObject({ code: EXIT.ok, out: "SPA-1: TI-1 → без эпика" });
  });
});
