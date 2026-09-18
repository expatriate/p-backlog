import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createProject, createTask } from "./create";
import { loadBacklog } from "./load";
import { makeTempDir, projectFile, taskFile, writeFiles } from "./testing/temp-dirs";

const NOW = new Date("2026-09-17T14:50:00Z");

async function loadProject(root: string, id: string) {
  const loaded = await loadBacklog(root);
  const project = loaded.projects.find((candidate) => candidate.id === id);
  if (!project) throw new Error(`нет проекта ${id}`);
  return { loaded, project };
}

describe("createTask", () => {
  it("выдаёт следующий номер и пишет файл, который читается обратно", async () => {
    const root = await makeTempDir();
    await writeFiles(root, { "spa/project.md": projectFile("SPA"), "spa/SPA-7.md": taskFile("SPA-7", "type: epic\n") });
    const { loaded, project } = await loadProject(root, "spa");

    const result = await createTask(root, {
      project,
      input: { title: "Таймауты", priority: "high", tags: ["Upload"], epic: "SPA-7", source: "src/a.ts:1", body: "Описание\n\n- [ ] шаг" },
      existingTasks: loaded.tasks,
      now: NOW,
    });

    expect(result).toMatchObject({ ok: true, task: { id: "SPA-8", status: "backlog", tags: ["upload"], epic: "SPA-7" } });
    const reloaded = await loadBacklog(root);
    expect(reloaded.errors).toEqual([]);
    expect(reloaded.tasks.find((task) => task.id === "SPA-8")).toEqual(result.ok ? result.task : undefined);
    expect(await readFile(join(root, "spa/SPA-8.md"), "utf8")).toContain("- [ ] шаг");
  });

  it("не выдаёт номера удалённых задач", async () => {
    const root = await makeTempDir();
    await writeFiles(root, { "spa/project.md": `---\nname: spa\nprefix: SPA\nrepos: []\nissuedUpTo: 7\n---\n`, "spa/SPA-1.md": taskFile("SPA-1") });
    const { loaded, project } = await loadProject(root, "spa");

    const result = await createTask(root, { project, input: { title: "После удаления" }, existingTasks: loaded.tasks, now: NOW });

    expect(result.ok && result.task.id).toBe("SPA-8");
  });

  it("отклоняет задачу, нарушающую правила, и не создаёт файл", async () => {
    const root = await makeTempDir();
    await writeFiles(root, { "spa/project.md": projectFile("SPA") });
    const { loaded, project } = await loadProject(root, "spa");

    const result = await createTask(root, { project, input: { title: "X", epic: "SPA-99" }, existingTasks: loaded.tasks, now: NOW });

    expect(result).toEqual({ ok: false, reason: "invalid", errors: ["эпик SPA-99 не найден"] });
    expect((await loadBacklog(root)).tasks).toEqual([]);
  });

  it("отклоняет пустой заголовок", async () => {
    const root = await makeTempDir();
    await writeFiles(root, { "spa/project.md": projectFile("SPA") });
    const { loaded, project } = await loadProject(root, "spa");
    expect((await createTask(root, { project, input: { title: "  " }, existingTasks: loaded.tasks, now: NOW })).ok).toBe(false);
  });

  it("параллельные создания получают разные ID", async () => {
    const root = await makeTempDir();
    await writeFiles(root, { "spa/project.md": projectFile("SPA") });
    const { loaded, project } = await loadProject(root, "spa");

    const results = await Promise.all(
      Array.from({ length: 10 }, (_, n) => createTask(root, { project, input: { title: `Задача ${n}` }, existingTasks: loaded.tasks, now: NOW })),
    );

    const ids = results.map((result) => (result.ok ? result.task.id : "ошибка"));
    expect(new Set(ids).size).toBe(10);
    expect((await loadBacklog(root)).tasks).toHaveLength(10);
  });
});

describe("createProject", () => {
  it("выводит id и префикс из имени репозитория и избегает занятых", async () => {
    const root = await makeTempDir();
    await writeFiles(root, { "spa/project.md": projectFile("SPA") });
    const { loaded } = await loadProject(root, "spa");

    const project = await createProject(root, "/work/other/spa", loaded.projects);

    expect(project).toMatchObject({ id: "spa-2", prefix: "SPA2", name: "spa", repos: ["/work/other/spa"] });
    const reloaded = await loadBacklog(root);
    expect(reloaded.projects.map((candidate) => candidate.id)).toEqual(["spa", "spa-2"]);
  });

  it("создаёт корневой каталог, если его нет", async () => {
    const root = join(await makeTempDir(), "backlog");
    const project = await createProject(root, "/work/partner-workspace", []);
    expect(project).toMatchObject({ id: "partner-workspace", prefix: "PW" });
  });
});
