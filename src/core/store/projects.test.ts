import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { readTextOrNull, withFile } from "./fs-utils";
import { deleteProject, reserveIssuedUpTo, setProjectActive } from "./projects";
import { failingOnce } from "./testing/fs-failures";
import { makeTempDir, projectFile, taskFile, writeFiles } from "./testing/temp-dirs";
import { loadBacklog } from "./load";
import { failOnPathError } from "./testing/path-errors";

vi.mock("./fs-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./fs-utils")>();
  return { ...actual, withFile: vi.fn(actual.withFile), readTextOrNull: vi.fn(actual.readTextOrNull) };
});

describe("проекты", () => {
  it("смена активности сохраняет посторонние поля и тело", async () => {
    const root = await makeTempDir();
    await writeFiles(root, { "spa/project.md": "---\nname: spa\nprefix: SPA\ncolor: green\n---\n\nЗаметки.\n" });

    expect(await setProjectActive(root, "spa", false, failOnPathError)).toMatchObject({ ok: true, project: { active: false } });

    const off = await readFile(join(root, "spa/project.md"), "utf8");
    expect(off).toContain("color: green");
    expect(off).toContain("Заметки.");
    expect(off).toContain("active: false");

    expect(await setProjectActive(root, "spa", true, failOnPathError)).toMatchObject({ ok: true, project: { active: true } });
    expect(await readFile(join(root, "spa/project.md"), "utf8")).not.toContain("active");
    expect(await setProjectActive(root, "нет-такого", false, failOnPathError)).toEqual({ ok: false, reason: "not-found" });
  });

  it("сбой снятия блокировки после правки project.md не превращает записанную правку в ошибку, сбой — в onError", async () => {
    const root = await makeTempDir();
    await writeFiles(root, { "spa/project.md": projectFile("SPA") });
    const reported: string[] = [];

    const result = await failingOnce(
      readTextOrNull,
      (path) => path === join(root, "spa/.project.md.lock"),
      () => setProjectActive(root, "spa", false, (path) => reported.push(path)),
    );

    expect(result).toMatchObject({ ok: true, changed: true });
    expect((await loadBacklog(root)).projects.map((project) => project.active)).toEqual([false]);
    expect(reported).toEqual([join(root, "spa/project.md")]);
  });

  it.skipIf(process.platform === "win32")("сбой синхронизации каталога после правки project.md не превращает записанную правку в ошибку, сбой — в onError", async () => {
    const root = await makeTempDir();
    await writeFiles(root, { "spa/project.md": projectFile("SPA") });
    const reported: string[] = [];

    const result = await failingOnce(
      withFile,
      (path) => path === join(root, "spa"),
      () => setProjectActive(root, "spa", false, (path) => reported.push(path)),
    );

    expect(result).toMatchObject({ ok: true, changed: true });
    expect((await loadBacklog(root)).projects.map((project) => project.active)).toEqual([false]);
    expect(reported).toEqual([join(root, "spa/project.md")]);
  });

  it("резерв номера берёт project.md с диска: правки имени и repos не теряются, номер не уменьшается", async () => {
    const root = await makeTempDir();
    const path = join(root, "spa/project.md");
    await writeFiles(root, { "spa/project.md": "---\nname: Переименован руками\nprefix: SPA\nrepos: [/new/repo]\nissuedUpTo: 9\n---\nЗаметки\n" });

    expect(await reserveIssuedUpTo({ id: "spa", path }, 5, failOnPathError)).toMatchObject({ ok: true });
    expect(await reserveIssuedUpTo({ id: "spa", path }, 12, failOnPathError)).toMatchObject({ ok: true });

    const [project] = (await loadBacklog(root)).projects;
    expect(project).toMatchObject({ name: "Переименован руками", repos: ["/new/repo"], issuedUpTo: 12, body: "Заметки\n" });
  });

  it("одновременные резерв номера и смена активности не теряют друг друга", async () => {
    const root = await makeTempDir();
    const path = join(root, "spa/project.md");
    await writeFiles(root, { "spa/project.md": projectFile("SPA") });

    for (let number = 1; number <= 20; number++) {
      await Promise.all([reserveIssuedUpTo({ id: "spa", path }, number, failOnPathError), setProjectActive(root, "spa", number % 2 === 0, failOnPathError)]);
      expect((await loadBacklog(root)).projects[0]).toMatchObject({ issuedUpTo: number, active: number % 2 === 0 });
    }
  });

  it("битый или пропавший project.md — номер не зарезервирован", async () => {
    const root = await makeTempDir();
    await writeFiles(root, { "spa/project.md": "сломано" });

    expect(await reserveIssuedUpTo({ id: "spa", path: join(root, "spa/project.md") }, 1, failOnPathError)).toMatchObject({ ok: false, reason: "invalid" });
    expect(await reserveIssuedUpTo({ id: "web", path: join(root, "web/project.md") }, 1, failOnPathError)).toEqual({ ok: false, reason: "not-found" });
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

  it.each(["..", "spa/../..", "", "."])("ID %j вне каталогов проектов не находит проект и ничего не удаляет", async (id) => {
    const outside = await makeTempDir();
    const root = join(outside, "backlog");
    await writeFiles(outside, { "project.md": projectFile("OUT"), "backlog/project.md": projectFile("ROOT"), "backlog/spa/project.md": projectFile("SPA") });

    expect(await setProjectActive(root, id, false, failOnPathError)).toEqual({ ok: false, reason: "not-found" });
    expect(await deleteProject(root, id)).toEqual({ ok: false, reason: "not-found" });

    expect(await readFile(join(outside, "project.md"), "utf8")).toBe(projectFile("OUT"));
    expect(await readFile(join(root, "project.md"), "utf8")).toBe(projectFile("ROOT"));
    expect((await loadBacklog(root)).projects.map((project) => project.id)).toEqual(["spa"]);
  });
});
