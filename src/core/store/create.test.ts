import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { coreMessages } from "../messages";
import type { Project } from "../model/types";
import { createProject, createTask } from "./create";
import { listDir, withFile } from "./fs-utils";
import { readJournal } from "./journal";
import { compactJournal } from "./journal-compaction";
import { loadBacklog, taskIdsOnDisk } from "./load";
import { sweepClosed } from "./sweep";
import { makeTempDir, projectFile, taskFile, writeFiles } from "./testing/temp-dirs";
import { failOnPathError } from "./testing/path-errors";

vi.mock("./fs-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./fs-utils")>();
  return { ...actual, listDir: vi.fn(actual.listDir), withFile: vi.fn(actual.withFile) };
});

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, rm: vi.fn(actual.rm) };
});

const ioError = () => Object.assign(new Error("ошибка ввода-вывода"), { code: "EIO" });

const AFTER_PUBLISH_FAILURES = [
  {
    name: "синхронизация каталога",
    happensHere: process.platform !== "win32",
    inject: async (projectDir: string) => {
      const { withFile: actual } = await vi.importActual<typeof import("./fs-utils")>("./fs-utils");
      vi.mocked(withFile).mockImplementation(async (path, use, opening) => (path === projectDir ? Promise.reject(ioError()) : actual(path, use, opening)));
    },
  },
  {
    name: "удаление временного файла",
    happensHere: true,
    inject: async () => {
      const { rm: actual } = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
      vi.mocked(rm).mockImplementation(async (path, options) => (String(path).endsWith(".tmp") ? Promise.reject(ioError()) : actual(path, options)));
    },
  },
];

const NOW = new Date("2026-09-17T14:50:00Z");

async function loadProject(root: string, id: string) {
  const loaded = await loadBacklog(root);
  const project = loaded.projects.find((candidate) => candidate.id === id);
  if (!project) throw new Error(`нет проекта ${id}`);
  return { loaded, project };
}

describe("createTask", () => {
  it.each(AFTER_PUBLISH_FAILURES.filter(({ happensHere }) => happensHere))(
    "сбой после создания файла ($name) не превращает созданную задачу в ошибку: событие created в журнале, сбой — в onError",
    async ({ inject }) => {
      const root = await makeTempDir();
      await writeFiles(root, { "spa/project.md": projectFile("SPA") });
      const { loaded, project } = await loadProject(root, "spa");
      const projectDir = join(root, "spa");
      await inject(projectDir);
      const reported: string[] = [];

      const result = await createTask(root, { project, input: { title: "Первая" }, existingTasks: loaded.tasks, now: NOW, via: "cli", onError: (path) => reported.push(path) });

      expect(result.ok && result.task.id).toBe("SPA-1");
      expect((await readJournal(projectDir, "spa")).events.map((event) => [event.task, event.kind])).toEqual([["SPA-1", "created"]]);
      expect(reported).toContain(join(projectDir, "SPA-1.md"));
    },
  );

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
      onError: failOnPathError,
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

    const result = await createTask(root, { project, input: { title: "После удаления" }, existingTasks: loaded.tasks, now: NOW, via: "cli", onError: failOnPathError });

    expect(result.ok && result.task.id).toBe("SPA-8");
  });

  it("файл задачи, удалённый вручную, не отдаёт свой номер: он записан в журнале", async () => {
    const root = await makeTempDir();
    await writeFiles(root, {
      "spa/project.md": projectFile("SPA"),
      "spa/SPA-1.md": taskFile("SPA-1"),
      "spa/journal.jsonl": `${JSON.stringify({ at: "2026-09-16T10:00:00+03:00", task: "SPA-5", via: "cli", kind: "created", type: "task", priority: "medium", tags: [] })}\n`,
    });
    const { loaded, project } = await loadProject(root, "spa");

    const result = await createTask(root, { project, input: { title: "После ручного удаления" }, existingTasks: loaded.tasks, now: NOW, via: "cli", onError: failOnPathError });

    expect(result.ok && result.task.id).toBe("SPA-6");
  });

  it("номер задачи, чьи события вычистило уплотнение журнала, не выдаётся снова", async () => {
    const root = await makeTempDir();
    const created = (id: string) => `${JSON.stringify({ at: "2026-01-05T10:00:00+03:00", task: id, via: "cli", kind: "created", type: "task", priority: "medium", tags: [] })}\n`;
    await writeFiles(root, { "spa/project.md": projectFile("SPA"), "spa/SPA-1.md": taskFile("SPA-1"), "spa/journal.jsonl": ["SPA-1", "SPA-3", "SPA-5"].map(created).join("") });
    await compactJournal(join(root, "spa"), await taskIdsOnDisk(join(root, "spa")), NOW);
    const { loaded, project } = await loadProject(root, "spa");

    const result = await createTask(root, { project, input: { title: "После уплотнения" }, existingTasks: loaded.tasks, now: NOW, via: "cli", onError: failOnPathError });

    expect((await readJournal(join(root, "spa"), "spa")).events.map((event) => event.task)).not.toContain("SPA-5");
    expect(result.ok && result.task.id).toBe("SPA-6");
  });

  it("каталог и файл без .md с именем-ID не сдвигают номер новой задачи", async () => {
    const root = await makeTempDir();
    await writeFiles(root, { "spa/project.md": projectFile("SPA"), "spa/SPA-1.md": taskFile("SPA-1"), "spa/SPA-12": "заметка" });
    await mkdir(join(root, "spa/SPA-9"));
    const { loaded, project } = await loadProject(root, "spa");

    const result = await createTask(root, { project, input: { title: "Следующая" }, existingTasks: loaded.tasks, now: NOW, via: "cli", onError: failOnPathError });

    expect(result.ok && result.task.id).toBe("SPA-2");
  });

  it("не выдаёт номер задачи, которую sweep удалил после загрузки снимка", async () => {
    const root = await makeTempDir();
    await writeFiles(root, {
      "spa/project.md": projectFile("SPA"),
      "spa/SPA-1.md": taskFile("SPA-1"),
      "spa/SPA-2.md": taskFile("SPA-2", "status: done\nclosed: 2026-09-01T10:00:00+03:00\n"),
    });
    const { loaded, project } = await loadProject(root, "spa");
    const sweep = await sweepClosed(root, { now: NOW, onError: failOnPathError }, coreMessages("ru"));

    const result = await createTask(root, { project, input: { title: "После sweep" }, existingTasks: loaded.tasks, now: NOW, via: "cli", onError: failOnPathError });

    expect(sweep.deleted).toEqual(["SPA-2"]);
    expect(result.ok && result.task.id).toBe("SPA-3");
  });

  it("отклоняет задачу, нарушающую правила, и не создаёт файл", async () => {
    const root = await makeTempDir();
    await writeFiles(root, { "spa/project.md": projectFile("SPA") });
    const { loaded, project } = await loadProject(root, "spa");

    const result = await createTask(root, { project, input: { title: "X", epic: "SPA-99" }, existingTasks: loaded.tasks, now: NOW, via: "cli", onError: failOnPathError });

    expect(result).toEqual({ ok: false, reason: "invalid", problems: [{ code: "epic-missing", epic: "SPA-99" }] });
    expect((await loadBacklog(root)).tasks).toEqual([]);
  });

  it("отклоняет пустой заголовок", async () => {
    const root = await makeTempDir();
    await writeFiles(root, { "spa/project.md": projectFile("SPA") });
    const { loaded, project } = await loadProject(root, "spa");
    expect((await createTask(root, { project, input: { title: "  " }, existingTasks: loaded.tasks, now: NOW, via: "cli", onError: failOnPathError })).ok).toBe(false);
  });

  it("параллельные создания получают разные ID", async () => {
    const root = await makeTempDir();
    await writeFiles(root, { "spa/project.md": projectFile("SPA") });
    const { loaded, project } = await loadProject(root, "spa");

    const results = await Promise.all(
      Array.from({ length: 10 }, (_, n) => createTask(root, { project, input: { title: `Задача ${n}` }, existingTasks: loaded.tasks, now: NOW, via: "cli", onError: failOnPathError })),
    );

    const ids = results.map((result) => (result.ok ? result.task.id : "ошибка"));
    expect(new Set(ids).size).toBe(10);
    expect((await loadBacklog(root)).tasks).toHaveLength(10);
  });

  it("пишет в журнал проекта событие создания", async () => {
    const root = await makeTempDir();
    await writeFiles(root, { "spa/project.md": projectFile("SPA") });
    const { loaded, project } = await loadProject(root, "spa");

    const result = await createTask(root, { project, input: { title: "Новая", priority: "high", source: "src/a.ts:1" }, existingTasks: loaded.tasks, now: NOW, via: "cli", onError: failOnPathError });

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

  it("не берёт префикс, объявленный в project.md с битым YAML, даже без файлов задач", async () => {
    const root = await makeTempDir();
    await writeFiles(root, { "spa/project.md": "---\nname: spa\nprefix: SPA\nrepos: [/a\n---\n" });

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

  it("два одновременных создания проекта для разных репозиториев с одним именем получают каждый свой проект", async () => {
    const root = await makeTempDir();

    const [first, second] = await Promise.all([createProject(root, "/a/spa", []), createProject(root, "/b/spa", [])]);

    expect([first.repos, second.repos]).toEqual([["/a/spa"], ["/b/spa"]]);
    expect(first.prefix).not.toBe(second.prefix);
    const reloaded = await loadBacklog(root);
    expect(reloaded.projects.map((project) => [project.id, project.repos]).sort()).toEqual(
      [
        [first.id, first.repos],
        [second.id, second.repos],
      ].sort(),
    );
  });

  it("каталог с файлами .md без project.md не занимается, а обходится", async () => {
    const root = await makeTempDir();
    await writeFiles(root, { "spa/notes.md": "заметки" });

    const project = await createProject(root, "/work/spa", []);

    expect(project.id).toBe("spa-2");
    expect(await readFile(join(root, "spa", "notes.md"), "utf8")).toBe("заметки");
  });

  it("project.md того же репозитория, появившийся в каталоге к моменту его листинга, присоединяется, а не заводит spa-2", async () => {
    const root = await makeTempDir();
    await mkdir(join(root, "spa"), { recursive: true });
    const { listDir: listActual } = await vi.importActual<typeof import("./fs-utils")>("./fs-utils");
    let concurrent: Promise<Project> | undefined;
    vi.mocked(listDir).mockImplementation(async (...args) => {
      if (concurrent === undefined && args[0] === join(root, "spa")) {
        concurrent = createProject(root, "/work/spa", []);
        await concurrent;
      }
      return listActual(...args);
    });

    const project = await createProject(root, "/work/spa", []);

    expect(project).toEqual(await concurrent);
    expect((await loadBacklog(root)).projects.map((candidate) => candidate.id)).toEqual(["spa"]);
  });

  it("создаёт корневой каталог, если его нет", async () => {
    const root = join(await makeTempDir(), "backlog");
    const project = await createProject(root, "/work/partner-workspace", []);
    expect(project).toMatchObject({ id: "partner-workspace", prefix: "PW" });
  });
});
