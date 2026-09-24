import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { deleteProject, reserveIssuedUpTo, setProjectActive } from "./projects";
import { makeTempDir, projectFile, taskFile, writeFiles } from "./testing/temp-dirs";
import { loadBacklog } from "./load";

describe("проекты", () => {
  it("смена активности сохраняет посторонние поля и тело", async () => {
    const root = await makeTempDir();
    await writeFiles(root, { "spa/project.md": "---\nname: spa\nprefix: SPA\ncolor: green\n---\n\nЗаметки.\n" });

    expect(await setProjectActive(root, "spa", false)).toMatchObject({ ok: true, project: { active: false } });

    const off = await readFile(join(root, "spa/project.md"), "utf8");
    expect(off).toContain("color: green");
    expect(off).toContain("Заметки.");
    expect(off).toContain("active: false");

    expect(await setProjectActive(root, "spa", true)).toMatchObject({ ok: true, project: { active: true } });
    expect(await readFile(join(root, "spa/project.md"), "utf8")).not.toContain("active");
    expect(await setProjectActive(root, "нет-такого", false)).toEqual({ ok: false, reason: "not-found" });
  });

  it("резерв номера берёт project.md с диска: правки имени и repos не теряются, номер не уменьшается", async () => {
    const root = await makeTempDir();
    const path = join(root, "spa/project.md");
    await writeFiles(root, { "spa/project.md": "---\nname: Переименован руками\nprefix: SPA\nrepos: [/new/repo]\nissuedUpTo: 9\n---\nЗаметки\n" });

    expect(await reserveIssuedUpTo({ id: "spa", path }, 5)).toBe(true);
    expect(await reserveIssuedUpTo({ id: "spa", path }, 12)).toBe(true);

    const [project] = (await loadBacklog(root)).projects;
    expect(project).toMatchObject({ name: "Переименован руками", repos: ["/new/repo"], issuedUpTo: 12, body: "Заметки\n" });
  });

  it("одновременные резерв номера и смена активности не теряют друг друга", async () => {
    const root = await makeTempDir();
    const path = join(root, "spa/project.md");
    await writeFiles(root, { "spa/project.md": projectFile("SPA") });

    for (let number = 1; number <= 20; number++) {
      await Promise.all([reserveIssuedUpTo({ id: "spa", path }, number), setProjectActive(root, "spa", number % 2 === 0)]);
      expect((await loadBacklog(root)).projects[0]).toMatchObject({ issuedUpTo: number, active: number % 2 === 0 });
    }
  });

  it("битый или пропавший project.md — номер не зарезервирован", async () => {
    const root = await makeTempDir();
    await writeFiles(root, { "spa/project.md": "сломано" });

    expect(await reserveIssuedUpTo({ id: "spa", path: join(root, "spa/project.md") }, 1)).toBe(false);
    expect(await reserveIssuedUpTo({ id: "web", path: join(root, "web/project.md") }, 1)).toBe(false);
  });

  it("удаление сносит каталог проекта, посторонний каталог не трогает", async () => {
    const root = await makeTempDir();
    await writeFiles(root, { "spa/project.md": projectFile("SPA"), "spa/SPA-1.md": taskFile("SPA-1"), "notes/todo.md": "заметки" });

    expect(await deleteProject(root, "spa")).toEqual({ ok: true });
    expect(await deleteProject(root, "notes")).toEqual({ ok: false, reason: "not-found" });

    const loaded = await loadBacklog(root);
    expect(loaded.projects).toEqual([]);
    expect(await readFile(join(root, "notes/todo.md"), "utf8")).toBe("заметки");
  });
});
