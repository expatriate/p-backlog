import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { coreMessages } from "../messages";
import { createProject, createTask } from "./create";
import { readJournal } from "./journal";
import { loadBacklog } from "./load";
import { sweepClosed } from "./sweep";
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
      via: "cli",
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

    const result = await createTask(root, { project, input: { title: "После удаления" }, existingTasks: loaded.tasks, now: NOW, via: "cli" });

    expect(result.ok && result.task.id).toBe("SPA-8");
  });

  it("не выдаёт номер задачи, которую sweep удалил после загрузки снимка", async () => {
    const root = await makeTempDir();
    await writeFiles(root, {
      "spa/project.md": projectFile("SPA"),
      "spa/SPA-1.md": taskFile("SPA-1"),
      "spa/SPA-2.md": taskFile("SPA-2", "status: done\nclosed: 2026-09-01T10:00:00+03:00\n"),
    });
    const { loaded, project } = await loadProject(root, "spa");
    const sweep = await sweepClosed(root, NOW, coreMessages("ru"));

    const result = await createTask(root, { project, input: { title: "После sweep" }, existingTasks: loaded.tasks, now: NOW, via: "cli" });

    expect(sweep.deleted).toEqual(["SPA-2"]);
    expect(result.ok && result.task.id).toBe("SPA-3");
  });

  it("отклоняет задачу, нарушающую правила, и не создаёт файл", async () => {
    const root = await makeTempDir();
    await writeFiles(root, { "spa/project.md": projectFile("SPA") });
    const { loaded, project } = await loadProject(root, "spa");

    const result = await createTask(root, { project, input: { title: "X", epic: "SPA-99" }, existingTasks: loaded.tasks, now: NOW, via: "cli" });

    expect(result).toEqual({ ok: false, reason: "invalid", errors: [{ code: "epic-missing", epic: "SPA-99" }] });
    expect((await loadBacklog(root)).tasks).toEqual([]);
  });

  it("отклоняет пустой заголовок", async () => {
    const root = await makeTempDir();
    await writeFiles(root, { "spa/project.md": projectFile("SPA") });
    const { loaded, project } = await loadProject(root, "spa");
    expect((await createTask(root, { project, input: { title: "  " }, existingTasks: loaded.tasks, now: NOW, via: "cli" })).ok).toBe(false);
  });

  it("параллельные создания получают разные ID", async () => {
    const root = await makeTempDir();
    await writeFiles(root, { "spa/project.md": projectFile("SPA") });
    const { loaded, project } = await loadProject(root, "spa");

    const results = await Promise.all(
      Array.from({ length: 10 }, (_, n) => createTask(root, { project, input: { title: `Задача ${n}` }, existingTasks: loaded.tasks, now: NOW, via: "cli" })),
    );

    const ids = results.map((result) => (result.ok ? result.task.id : "ошибка"));
    expect(new Set(ids).size).toBe(10);
    expect((await loadBacklog(root)).tasks).toHaveLength(10);
  });

  it("пишет в журнал проекта событие создания", async () => {
    const root = await makeTempDir();
    await writeFiles(root, { "spa/project.md": projectFile("SPA") });
    const { loaded, project } = await loadProject(root, "spa");

    const result = await createTask(root, { project, input: { title: "Новая", priority: "high", source: "src/a.ts:1" }, existingTasks: loaded.tasks, now: NOW, via: "cli" });

    expect(result.ok).toBe(true);
    const journal = await readJournal(join(root, "spa"), "spa");
    expect(journal.events).toMatchObject([{ kind: "created", task: "SPA-1", via: "cli", priority: "high", source: "src/a.ts:1" }]);
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

  it("не берёт префикс, который заняли файлы задач проекта с неразобранным project.md", async () => {
    const root = await makeTempDir();
    await writeFiles(root, { "spa/project.md": "сломано", "spa/SPA-1.md": taskFile("SPA-1") });

    const project = await createProject(root, "/work/spa", []);

    expect(project.prefix).not.toBe("SPA");
  });

  it("каталог, который параллельное создание уже завело, но ещё не записало project.md, занимается, а не обходится как spa-2", async () => {
    const root = await makeTempDir();
    await mkdir(join(root, "spa"), { recursive: true });

    const project = await createProject(root, "/work/spa", []);

    expect(project.id).toBe("spa");
  });

  it("два одновременных создания проекта для одного репозитория получают один и тот же проект", async () => {
    const root = await makeTempDir();

    const [first, second] = await Promise.all([createProject(root, "/work/spa", []), createProject(root, "/work/spa", [])]);

    expect(first).toEqual(second);
    expect((await loadBacklog(root)).projects.map((project) => project.id)).toEqual(["spa"]);
  });

  it("создаёт корневой каталог, если его нет", async () => {
    const root = join(await makeTempDir(), "backlog");
    const project = await createProject(root, "/work/partner-workspace", []);
    expect(project).toMatchObject({ id: "partner-workspace", prefix: "PW" });
  });
});
