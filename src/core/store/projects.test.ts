import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { deleteProject, setProjectActive } from "./projects";
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
