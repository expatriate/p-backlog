import { chmod, mkdir, symlink } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { contentVersion } from "./fs-utils";
import { loadBacklog } from "./load";
import { makeTempDir, projectFile, taskFile, writeFiles } from "./testing/temp-dirs";

describe("loadBacklog", () => {
  it("возвращает пустой беклог, если каталога нет", async () => {
    const root = join(await makeTempDir(), "missing");
    expect(await loadBacklog(root)).toEqual({ projects: [], tasks: [], errors: [] });
  });

  it("читает проекты и задачи, пропуская посторонние файлы", async () => {
    const root = await makeTempDir();
    await writeFiles(root, {
      "spa/project.md": projectFile("SPA"),
      "spa/SPA-2.md": taskFile("SPA-2"),
      "spa/SPA-10.md": taskFile("SPA-10", "status: done\n"),
      "spa/notes.md": "просто заметки",
      "spa/.SPA-3.md.1234.tmp": "временный файл",
      ".git/config": "",
      "torg-io/project.md": projectFile("TI"),
      "torg-io/TI-1.md": taskFile("TI-1"),
    });
    const loaded = await loadBacklog(root);
    expect(loaded.errors).toEqual([]);
    expect(loaded.projects.map((project) => [project.id, project.prefix])).toEqual([
      ["spa", "SPA"],
      ["torg-io", "TI"],
    ]);
    expect(loaded.tasks.map((task) => [task.id, task.projectId])).toEqual([
      ["SPA-2", "spa"],
      ["SPA-10", "spa"],
      ["TI-1", "torg-io"],
    ]);
    expect(loaded.tasks[0]?.version).toBe(contentVersion(taskFile("SPA-2")));
    expect(loaded.tasks[0]?.path).toBe(join(root, "spa/SPA-2.md"));
  });

  it("собирает ошибки разбора и продолжает загрузку", async () => {
    const root = await makeTempDir();
    await writeFiles(root, {
      "spa/project.md": projectFile("SPA"),
      "spa/SPA-1.md": taskFile("SPA-1"),
      "spa/SPA-2.md": "без frontmatter",
      "spa/SPA-3.md": taskFile("SPA-4"),
      "spa/TI-1.md": taskFile("TI-1"),
      "broken/project.md": "---\nname: broken\nprefix: lower\n---\n",
      "notes/readme.txt": "",
    });
    const loaded = await loadBacklog(root);
    expect(loaded.tasks.map((task) => task.id)).toEqual(["SPA-1"]);
    expect(loaded.errors.map((error) => [error.projectId, error.path.slice(root.length + 1)])).toEqual([
      ["broken", join("broken", "project.md")],
      ["spa", join("spa", "SPA-2.md")],
      ["spa", join("spa", "SPA-3.md")],
      ["spa", join("spa", "TI-1.md")],
    ]);
  });

  it.skipIf(process.platform === "win32")(
    "проект за ссылкой на каталог загружается как обычный, а задача-ссылка на файл — ошибка разбора: запись через неё разорвала бы ссылку (ссылки на Windows требуют прав)",
    async () => {
      const outside = await makeTempDir();
      const root = join(outside, "backlog");
      await writeFiles(outside, {
        "sync/spa/project.md": projectFile("SPA"),
        "sync/spa/SPA-1.md": taskFile("SPA-1"),
        "backlog/web/project.md": projectFile("WEB"),
        "shared/WEB-1.md": taskFile("WEB-1"),
      });
      await symlink(join(outside, "sync/spa"), join(root, "spa"));
      await symlink(join(outside, "shared/WEB-1.md"), join(root, "web/WEB-1.md"));

      const loaded = await loadBacklog(root);

      expect(loaded.projects.map((project) => project.id)).toEqual(["spa", "web"]);
      expect(loaded.tasks.map((task) => [task.id, task.projectId])).toEqual([["SPA-1", "spa"]]);
      expect(loaded.errors.map((error) => [error.path.slice(root.length + 1), error.problems.map((problem) => problem.code)])).toEqual([[join("web", "WEB-1.md"), ["task-is-link"]]]);
    },
  );

  it.skipIf(process.platform === "win32")("битая ссылка на месте проекта или задачи и каталог с именем задачи — ошибки разбора, остальной беклог загружается (ссылки на Windows требуют прав)", async () => {
    const root = await makeTempDir();
    await writeFiles(root, { "spa/project.md": projectFile("SPA"), "spa/SPA-1.md": taskFile("SPA-1") });
    await mkdir(join(root, "spa/SPA-2.md"));
    await symlink(join(root, "missing.md"), join(root, "spa/SPA-3.md"));
    await symlink(join(root, "missing"), join(root, "ghost"));

    const loaded = await loadBacklog(root);

    expect(loaded.tasks.map((task) => task.id)).toEqual(["SPA-1"]);
    expect(loaded.errors.map((error) => [error.projectId, error.path.slice(root.length + 1), error.problems.map((problem) => problem.code)])).toEqual([
      ["ghost", "ghost", ["link-unreachable"]],
      ["spa", join("spa", "SPA-2.md"), ["not-a-file"]],
      ["spa", join("spa", "SPA-3.md"), ["task-is-link"]],
    ]);
  });

  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "ссылка на каталог проекта без прав доступа — ошибка разбора этого проекта, остальной беклог загружается (на Windows ссылки требуют прав, а chmod не закрывает каталог; root читает всё)",
    async () => {
      const outside = await makeTempDir();
      const root = join(outside, "backlog");
      await writeFiles(outside, { "locked/project.md": projectFile("LCK"), "backlog/spa/project.md": projectFile("SPA") });
      await symlink(join(outside, "locked"), join(root, "lck"));
      await chmod(join(outside, "locked"), 0o000);
      onTestFinished(() => chmod(join(outside, "locked"), 0o700));

      const loaded = await loadBacklog(root);

      expect(loaded.projects.map((project) => project.id)).toEqual(["spa"]);
      expect(loaded.errors.map((error) => [error.projectId, error.problems.map((problem) => problem.code)])).toEqual([["lck", ["link-unreachable"]]]);
    },
  );
});
