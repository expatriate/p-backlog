import { join } from "node:path";
import { describe, expect, it } from "vitest";
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
      ["broken", "broken/project.md"],
      ["spa", "spa/SPA-2.md"],
      ["spa", "spa/SPA-3.md"],
      ["spa", "spa/TI-1.md"],
    ]);
  });
});
