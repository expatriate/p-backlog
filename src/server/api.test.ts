import { mkdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import type { BatchResponse, ConflictResponse, ProjectsResponse, Revision, ErrorResponse, StatsReport, TasksResponse } from "../core/api/contract";
import { FileBusyError } from "../core/store/file-lock";
import { appendJournal, readJournal } from "../core/store/journal";
import { loadBacklog } from "../core/store/load";
import { makeGitRepo, makeTempDir, projectFile, taskFile, writeFiles } from "../core/store/testing/temp-dirs";
import type { Project, Task } from "../core/model/types";
import { formatLocalIso } from "../core/model/dates";
import { makeGraphDb } from "../core/code-review-graph/testing/make-graph-db";
import { makeTestApp, SAMPLE_FILES, TEST_NOW, type TestApp } from "./testing/test-app";

vi.mock("../core/store/file-lock", async (importOriginal) => (await import("../core/store/testing/lock-wait")).fileLockWithShortWait(await importOriginal<typeof import("../core/store/file-lock")>()));

describe("GET /api/projects и /api/tasks", () => {
  it("отдают проекты, задачи и ошибки разбора", async () => {
    const backlog = await makeTestApp({ ...SAMPLE_FILES, "spa/SPA-9.md": "сломано" });

    const { projects } = (await (await backlog.request("/api/projects")).json()) as ProjectsResponse;
    expect(projects.map((project) => project.id)).toEqual(["spa", "torg-io"]);

    const response = await backlog.request("/api/tasks");
    expect(response.status).toBe(200);
    const { tasks, errors } = (await response.json()) as TasksResponse;
    expect(tasks.map((task) => task.id)).toEqual(["SPA-1", "SPA-2", "SPA-3", "TI-1"]);
    expect(tasks[0]).toMatchObject({ id: "SPA-1", priority: "high", tags: ["upload"], projectId: "spa" });
    expect(tasks[0]?.version).toHaveLength(40);
    expect(errors).toEqual([{ path: expect.stringContaining("SPA-9.md"), projectId: "spa", message: expect.any(String) }]);
  });
});

describe("нечитаемый журнал проекта", () => {
  it("не ломает список задач и правку: задачи отдаются, правка сохраняется", async () => {
    const backlog = await makeTestApp(SAMPLE_FILES);
    await mkdir(join(backlog.root, "spa", "journal.jsonl"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect((await backlog.request("/api/projects")).status).toBe(200);
    const listed = (await (await backlog.request("/api/tasks")).json()) as TasksResponse;
    expect(listed.tasks.map((task) => task.id)).toEqual(["SPA-1", "SPA-2", "SPA-3", "TI-1"]);

    const response = await backlog.json("/api/tasks/SPA-1", "PATCH", { version: await backlog.taskVersion("SPA-1"), changes: { priority: "low" } });

    expect(response.status).toBe(200);
    expect((await backlog.taskOnDisk("SPA-1")).priority).toBe("low");
  });
});

describe("GET /api/projects: граф кода", () => {
  it("проект знает, в каком состоянии граф его репозитория", async () => {
    const home = await makeTempDir();
    const withGraph = await makeGitRepo(home, "projects/spa");
    const withoutGraph = await makeGitRepo(home, "projects/torg-io");
    await makeGraphDb(withGraph, []);
    const backlog = await makeTestApp({
      ...SAMPLE_FILES,
      "spa/project.md": projectFile("SPA", [withGraph]),
      "torg-io/project.md": projectFile("TI", [withoutGraph]),
    });

    const { projects } = (await (await backlog.request("/api/projects")).json()) as ProjectsResponse;

    expect(projects.map((project) => [project.id, project.codeGraph])).toEqual([
      ["spa", "fresh"],
      ["torg-io", "none"],
    ]);
  });
});

describe("PATCH /api/tasks/:id", () => {
  it("меняет задачу и возвращает новую версию", async () => {
    const backlog = await makeTestApp(SAMPLE_FILES);
    const version = await backlog.taskVersion("SPA-1");

    const response = await backlog.json("/api/tasks/SPA-1", "PATCH", { version, changes: { status: "done", epic: "SPA-3" } });

    expect(response.status).toBe(200);
    const task = (await response.json()) as Task;
    expect(task).toMatchObject({ status: "done", epic: "SPA-3", closed: formatLocalIso(TEST_NOW) });
    expect(task.version).not.toBe(version);
  });

  it("не даёт интерфейсу проставить причину закрытия", async () => {
    const backlog = await makeTestApp(SAMPLE_FILES);
    const version = await backlog.taskVersion("SPA-1");

    const response = await backlog.json("/api/tasks/SPA-1", "PATCH", { version, changes: { status: "done", resolution: "fixed" } });

    expect(response.status).toBe(422);
    expect(((await response.json()) as ErrorResponse).errors[0]).toContain("Нераспознанный ключ");
  });

  it("отвечает 409 на устаревшую версию и отдаёт актуальную задачу", async () => {
    const backlog = await makeTestApp(SAMPLE_FILES);

    const response = await backlog.json("/api/tasks/SPA-1", "PATCH", { version: "старая", changes: { status: "done" } });

    expect(response.status).toBe(409);
    expect(((await response.json()) as ConflictResponse).current).toMatchObject({ id: "SPA-1", status: "backlog" });
  });

  it("правка поверх снимка, устаревшего без события наблюдателя, не пишет поверх файла и проходит со свежей версией", async () => {
    const backlog = await makeTestApp(SAMPLE_FILES);
    const { tasks } = (await (await backlog.request("/api/tasks")).json()) as TasksResponse;
    const external = taskFile("SPA-1", "priority: low\n");
    await writeFiles(backlog.root, { "spa/SPA-1.md": external });

    const stale = await backlog.json("/api/tasks/SPA-1", "PATCH", { version: tasks[0]?.version, changes: { status: "done" } });

    expect(stale.status).toBe(409);
    const { current } = (await stale.json()) as ConflictResponse;
    expect(current).toMatchObject({ id: "SPA-1", priority: "low" });
    expect(await readFile(join(backlog.root, "spa/SPA-1.md"), "utf8")).toBe(external);

    const retried = await backlog.json("/api/tasks/SPA-1", "PATCH", { version: current.version, changes: { status: "done" } });
    expect(retried.status).toBe(200);
    expect((await retried.json()) as Task).toMatchObject({ priority: "low", status: "done" });
  });

  it("отвечает 404, 422 на неизвестное поле и 422 на нарушение правил", async () => {
    const backlog = await makeTestApp(SAMPLE_FILES);
    const version = await backlog.taskVersion("SPA-1");

    expect((await backlog.json("/api/tasks/SPA-99", "PATCH", { version, changes: {} })).status).toBe(404);
    expect((await backlog.json("/api/tasks/SPA-1", "PATCH", { changes: { status: "done" } })).status).toBe(422);
    const unknownField = await backlog.json("/api/tasks/SPA-1", "PATCH", { version, changes: { id: "SPA-7" } });
    expect(unknownField.status).toBe(422);
    expect(((await unknownField.json()) as ErrorResponse).errors[0]).toContain("Нераспознанный ключ");

    const cycle = await backlog.json("/api/tasks/SPA-1", "PATCH", { version, changes: { blockedBy: ["SPA-2"] } });
    expect(cycle.status).toBe(422);
    expect(((await cycle.json()) as ErrorResponse).errors[0]).toContain("цикл блокеров");
  });

  it("не назначает эпик из другого проекта", async () => {
    const backlog = await makeTestApp({ ...SAMPLE_FILES, "torg-io/TI-2.md": taskFile("TI-2", "type: epic\n") });
    const version = await backlog.taskVersion("SPA-1");

    const response = await backlog.json("/api/tasks/SPA-1", "PATCH", { version, changes: { epic: "TI-2" } });

    expect(response.status).toBe(422);
    expect(((await response.json()) as ErrorResponse).errors).toEqual(["эпик TI-2 из другого проекта — снимите эпик или выберите эпик этого проекта"]);
    expect((await loadBacklog(backlog.root)).tasks.find((task) => task.id === "SPA-1")?.epic).toBeUndefined();
  });

  it("ошибка разбора правки не показывает интерфейсу путь поля", async () => {
    const backlog = await makeTestApp(SAMPLE_FILES);
    const version = await backlog.taskVersion("SPA-1");

    const response = await backlog.json("/api/tasks/SPA-1", "PATCH", { version, changes: { blockedBy: ["SPA-2", "12", "x"] } });

    expect(response.status).toBe(422);
    expect(((await response.json()) as ErrorResponse).errors).toEqual(["некорректный ID"]);
  });

  it("правка из интерфейса пишет в журнал событие с источником web", async () => {
    const backlog = await makeTestApp(SAMPLE_FILES);
    const version = await backlog.taskVersion("SPA-1");

    await backlog.json("/api/tasks/SPA-1", "PATCH", { version, changes: { status: "in-progress" } });

    const journal = await readJournal(join(backlog.root, "spa"), "spa");
    expect(journal.events).toMatchObject([{ kind: "status", task: "SPA-1", from: "backlog", to: "in-progress", via: "web" }]);
  });

  it("категория ставится и убирается, в журнале события category от web", async () => {
    const backlog = await makeTestApp(SAMPLE_FILES);

    const set = await backlog.json("/api/tasks/SPA-1", "PATCH", { version: await backlog.taskVersion("SPA-1"), changes: { category: "bug" } });
    expect(set.status).toBe(200);
    expect(((await set.json()) as Task).category).toBe("bug");

    const cleared = await backlog.json("/api/tasks/SPA-1", "PATCH", { version: await backlog.taskVersion("SPA-1"), changes: { category: null } });
    expect(((await cleared.json()) as Task).category).toBeUndefined();

    const events = (await readJournal(join(backlog.root, "spa"), "spa")).events;
    expect(events).toMatchObject([
      { kind: "category", to: "bug", via: "web" },
      { kind: "category", from: "bug", via: "web" },
    ]);
  });

  it("неизвестная категория — 422", async () => {
    const backlog = await makeTestApp(SAMPLE_FILES);

    const response = await backlog.json("/api/tasks/SPA-1", "PATCH", { version: await backlog.taskVersion("SPA-1"), changes: { category: "spaghetti" } });

    expect(response.status).toBe(422);
  });
});

describe("POST /api/tasks/batch", () => {
  it("закрывает несколько задач: done с новой версией, файлы на диске закрыты", async () => {
    const backlog = await makeTestApp(SAMPLE_FILES);
    const v1 = await backlog.taskVersion("SPA-1");
    const v2 = await backlog.taskVersion("TI-1");

    const response = await backlog.json("/api/tasks/batch", "POST", {
      tasks: [
        { id: "SPA-1", version: v1 },
        { id: "TI-1", version: v2 },
      ],
      action: { kind: "close", reason: "Неактуально" },
    });

    expect(response.status).toBe(200);
    const { results } = (await response.json()) as BatchResponse;
    expect(results).toEqual([
      { id: "SPA-1", outcome: "done", version: expect.any(String), previous: expect.objectContaining({ status: "backlog" }) },
      { id: "TI-1", outcome: "done", version: expect.any(String), previous: expect.objectContaining({ status: "backlog" }) },
    ]);
    const spa1 = results.find((result) => result.id === "SPA-1");
    if (spa1?.outcome === "done") expect(spa1.version).not.toBe(v1);

    const { tasks } = (await (await backlog.request("/api/tasks")).json()) as TasksResponse;
    expect(tasks.find((task) => task.id === "SPA-1")).toMatchObject({ status: "cancelled", resolution: "obsolete", reason: "Неактуально" });
    expect(tasks.find((task) => task.id === "TI-1")).toMatchObject({ status: "cancelled", resolution: "obsolete", reason: "Неактуально" });
  });

  it("склеивает переносы в причине закрытия так же, как команда close", async () => {
    const backlog = await makeTestApp(SAMPLE_FILES);

    await backlog.json("/api/tasks/batch", "POST", {
      tasks: [{ id: "SPA-1", version: await backlog.taskVersion("SPA-1") }],
      action: { kind: "close", reason: "  Дубль:\n   то же, что TI-1  " },
    });

    const { tasks } = (await (await backlog.request("/api/tasks")).json()) as TasksResponse;
    expect(tasks.find((task) => task.id === "SPA-1")?.reason).toBe("Дубль: то же, что TI-1");
  });

  it("устаревшая версия — skipped changed, текст на языке настройки", async () => {
    const backlog = await makeTestApp(SAMPLE_FILES, { language: "en" });
    const version = await backlog.taskVersion("SPA-1");
    await backlog.json("/api/tasks/SPA-1", "PATCH", { version, changes: { priority: "low" } });

    const response = await backlog.json("/api/tasks/batch", "POST", {
      tasks: [{ id: "SPA-1", version }],
      action: { kind: "priority", priority: "high" },
    });

    expect(response.status).toBe(200);
    const { results } = (await response.json()) as BatchResponse;
    expect(results).toEqual([{ id: "SPA-1", outcome: "skipped", reason: "changed", message: "SPA-1 changed on disk" }]);
  });

  it("недопустимое действие — skipped invalid, с текстом причины", async () => {
    const backlog = await makeTestApp(SAMPLE_FILES);
    const version = await backlog.taskVersion("SPA-3");

    const response = await backlog.json("/api/tasks/batch", "POST", {
      tasks: [{ id: "SPA-3", version }],
      action: { kind: "epic", epic: "SPA-3" },
    });

    const { results } = (await response.json()) as BatchResponse;
    expect(results).toEqual([{ id: "SPA-3", outcome: "skipped", reason: "invalid", message: "SPA-3: действие к ней не подходит" }]);
  });

  it("restore возвращает задачу к прежним значениям, проверено на диске", async () => {
    const backlog = await makeTestApp(SAMPLE_FILES);
    const version = await backlog.taskVersion("SPA-1");

    const closeResponse = await backlog.json("/api/tasks/batch", "POST", {
      tasks: [{ id: "SPA-1", version }],
      action: { kind: "close", reason: "Неактуально" },
    });
    const closed = ((await closeResponse.json()) as BatchResponse).results[0];
    if (closed?.outcome !== "done") throw new Error("ожидался done");

    const restoreResponse = await backlog.json("/api/tasks/batch", "POST", {
      tasks: [{ id: "SPA-1", version: closed.version }],
      action: { kind: "restore", changes: { "SPA-1": closed.previous } },
    });

    expect(restoreResponse.status).toBe(200);
    const restored = ((await restoreResponse.json()) as BatchResponse).results[0];
    expect(restored).toMatchObject({ id: "SPA-1", outcome: "done" });

    const { tasks } = (await (await backlog.request("/api/tasks")).json()) as TasksResponse;
    const restoredOnDisk = tasks.find((task) => task.id === "SPA-1");
    expect(restoredOnDisk).toMatchObject({ status: "backlog", priority: "high" });
    expect(restoredOnDisk?.resolution).toBeUndefined();
    expect(restoredOnDisk?.reason).toBeUndefined();
  });

  it("задача, занятая другим процессом, пропускается как busy, остальные меняются", async () => {
    const backlog = await makeTestApp(SAMPLE_FILES);
    const tasks = [
      { id: "SPA-1", version: await backlog.taskVersion("SPA-1") },
      { id: "SPA-2", version: await backlog.taskVersion("SPA-2") },
      { id: "TI-1", version: await backlog.taskVersion("TI-1") },
    ];
    await writeFiles(backlog.root, { "spa/.SPA-2.md.lock": "другой процесс" });

    const response = await backlog.json("/api/tasks/batch", "POST", { tasks, action: { kind: "priority", priority: "critical" } });

    expect(response.status).toBe(200);
    const { results } = (await response.json()) as BatchResponse;
    expect(results.map((result) => [result.id, result.outcome === "done" ? "done" : result.reason])).toEqual([
      ["SPA-1", "done"],
      ["SPA-2", "busy"],
      ["TI-1", "done"],
    ]);
    expect(results.find((result) => result.id === "SPA-2")).toMatchObject({ message: "SPA-2 занята другим процессом" });
    const { tasks: after } = (await (await backlog.request("/api/tasks")).json()) as TasksResponse;
    expect(after.filter((task) => task.priority === "critical").map((task) => task.id)).toEqual(["SPA-1", "TI-1"]);
  });

  it("тело без tasks, больше 500 задач и пустая причина закрытия не проходят схему", async () => {
    const backlog = await makeTestApp(SAMPLE_FILES);
    const version = await backlog.taskVersion("SPA-1");

    const noTasks = await backlog.json("/api/tasks/batch", "POST", { action: { kind: "priority", priority: "high" } });
    expect(noTasks.status).toBe(422);

    const tooMany = await backlog.json("/api/tasks/batch", "POST", {
      tasks: Array.from({ length: 501 }, (_, index) => ({ id: `SPA-${index + 1}`, version: "v" })),
      action: { kind: "priority", priority: "high" },
    });
    expect(tooMany.status).toBe(422);

    const emptyReason = await backlog.json("/api/tasks/batch", "POST", {
      tasks: [{ id: "SPA-1", version }],
      action: { kind: "close", reason: "  \n " },
    });
    expect(emptyReason.status).toBe(422);
  });
});

describe("неизвестный адрес API", () => {
  it("отдаёт 404 с ошибкой, а не страницу приложения", async () => {
    const backlog = await makeTestApp(SAMPLE_FILES, { staticDir: await makeTempDir() });

    const response = await backlog.request("/api/stats/flow");

    expect(response.status).toBe(404);
    expect(((await response.json()) as ErrorResponse).errors).toEqual(["Неизвестный адрес API: /api/stats/flow"]);
  });
});

describe("защита локального API", () => {
  it("отклоняет не-JSON тело", async () => {
    const backlog = await makeTestApp(SAMPLE_FILES);

    const plain = await backlog.request("/api/tasks/SPA-1", { method: "PATCH", body: "status=done" });
    expect(plain.status).toBe(415);
  });

  it.each([
    ["GET", "/"],
    ["GET", "/p/spa/t/SPA-1"],
    ["GET", "/assets/app.js"],
    ["GET", "/api/tasks"],
    ["DELETE", "/api/projects/spa"],
  ])("чужой Host или порт не получает ни страницу, ни API: %s %s", async (method, path) => {
    const staticDir = await makeTempDir();
    await writeFiles(staticDir, { "index.html": "<!doctype html><title>Беклог</title>", "assets/app.js": "console.log('app');" });
    const backlog = await makeTestApp(SAMPLE_FILES, { staticDir });

    for (const host of ["attacker.example:4317", "localhost:80"]) {
      const response = await backlog.app.request(`http://${host}${path}`, {
        method,
        headers: { host, "content-type": "application/json" },
        body: method === "GET" ? null : JSON.stringify({ confirm: "spa" }),
      });
      expect(response.status).toBe(403);
    }
    const { projects } = (await (await backlog.request("/api/projects")).json()) as ProjectsResponse;
    expect(projects.map((project) => project.id)).toContain("spa");
  });
});

describe("GET /api/events", () => {
  it("присылает событие change при изменении каталога", async () => {
    const backlog = await makeTestApp(SAMPLE_FILES);

    const response = await backlog.request("/api/events");
    expect(response.headers.get("content-type")).toContain("text/event-stream");

    const reader = response.body?.getReader();
    if (!reader) throw new Error("нет потока событий");
    await backlog.emitChange();
    const chunk = await reader.read();
    expect(new TextDecoder().decode(chunk.value)).toContain("event: change");
    await reader.cancel();
  });
});

describe("ревизия данных в ответах и событиях", () => {
  async function openChanges(backlog: TestApp) {
    const reader = (await backlog.request("/api/events")).body?.pipeThrough(new TextDecoderStream()).getReader();
    if (!reader) throw new Error("нет потока событий");
    onTestFinished(() => reader.cancel());
    return async (paths: readonly string[]): Promise<Revision> => {
      await backlog.emitChange(paths);
      const { value = "" } = await reader.read();
      return JSON.parse(value.match(/^data: (.*)$/m)?.[1] ?? "null") as Revision;
    };
  }
  const tasksRevision = async (backlog: TestApp) => ((await (await backlog.request("/api/tasks")).json()) as TasksResponse).revision;
  const path = (backlog: TestApp, name: string) => join(backlog.root, "spa", name);

  it("своя запись не сдвигает ревизию события: список после неё уже актуален", async () => {
    const backlog = await makeTestApp(SAMPLE_FILES);
    const change = await openChanges(backlog);
    const before = await tasksRevision(backlog);

    await backlog.json("/api/tasks/SPA-1", "PATCH", { version: await backlog.taskVersion("SPA-1"), changes: { priority: "low" } });
    const afterWrite = await tasksRevision(backlog);

    expect(afterWrite.seq).toBeGreaterThan(before.seq);
    expect(await change([path(backlog, "SPA-1.md"), path(backlog, "journal.jsonl")])).toEqual(afterWrite);
  });

  it("эпик, переоткрытый своей записью задачи, — тоже своя запись: ревизия события не сдвигается", async () => {
    const autoClosedEpic = `type: epic\nstatus: done\nclosed: ${formatLocalIso(TEST_NOW)}\nresolution: epic-done\nreason: готово\n`;
    const backlog = await makeTestApp({ ...SAMPLE_FILES, "spa/SPA-7.md": taskFile("SPA-7", autoClosedEpic), "spa/SPA-8.md": taskFile("SPA-8", "epic: SPA-7\nstatus: done\n") });
    const change = await openChanges(backlog);

    await backlog.json("/api/tasks/SPA-8", "PATCH", { version: await backlog.taskVersion("SPA-8"), changes: { status: "backlog" } });
    const { tasks, revision: afterWrite } = (await (await backlog.request("/api/tasks")).json()) as TasksResponse;

    expect(tasks.find((task) => task.id === "SPA-7")?.status).toBe("backlog");
    expect(await change([path(backlog, "SPA-8.md"), path(backlog, "SPA-7.md"), path(backlog, "journal.jsonl")])).toEqual(afterWrite);
  });

  it("чужое изменение — в том числе поверх своей записи — сдвигает ревизию, и список её догоняет", async () => {
    const backlog = await makeTestApp(SAMPLE_FILES);
    const change = await openChanges(backlog);
    await backlog.json("/api/tasks/SPA-1", "PATCH", { version: await backlog.taskVersion("SPA-1"), changes: { priority: "low" } });
    const afterWrite = await tasksRevision(backlog);

    await writeFiles(backlog.root, { "spa/SPA-1.md": taskFile("SPA-1", "priority: critical\n") });
    const foreign = await change([path(backlog, "SPA-1.md")]);

    expect(foreign.seq).toBeGreaterThan(afterWrite.seq);
    expect(await tasksRevision(backlog)).toEqual(foreign);
    expect(await change([])).toMatchObject({ seq: foreign.seq + 1 });
  });

  it("запись агента в журнал, пришедшая отдельно от его правки файла, — чужое изменение: «закрыта в вебе» пересчитывается", async () => {
    const backlog = await makeTestApp(SAMPLE_FILES);
    const change = await openChanges(backlog);
    const tasksResponse = async () => (await (await backlog.request("/api/tasks")).json()) as TasksResponse;
    await backlog.json("/api/tasks/batch", "POST", { tasks: [{ id: "SPA-1", version: await backlog.taskVersion("SPA-1") }], action: { kind: "close", reason: "неактуально" } });
    await backlog.json("/api/tasks/SPA-1", "PATCH", { version: await backlog.taskVersion("SPA-1"), changes: { status: "backlog" } });
    const closedAt = new Date(TEST_NOW.getTime() + 60_000);

    await writeFiles(backlog.root, { "spa/SPA-1.md": taskFile("SPA-1", `status: done\nclosed: ${formatLocalIso(closedAt)}\nresolution: fixed\nreason: готово\n`) });
    await change([path(backlog, "SPA-1.md")]);
    expect((await tasksResponse()).closedInWeb).toEqual(["SPA-1"]);
    await appendJournal(join(backlog.root, "spa"), [{ at: formatLocalIso(closedAt), task: "SPA-1", via: "cli", kind: "status", from: "backlog", to: "done", resolution: "fixed" }]);
    const afterJournal = await change([path(backlog, "journal.jsonl")]);

    expect(await tasksResponse()).toMatchObject({ closedInWeb: [], revision: afterJournal });
  });
});

describe("статика", () => {
  it("отдаёт файл и возвращает index.html на путь приложения", async () => {
    const staticDir = await makeTempDir();
    await writeFiles(staticDir, {
      "index.html": "<!doctype html><title>Беклог</title>",
      "assets/app.js": "console.log('app');",
    });
    const backlog = await makeTestApp(SAMPLE_FILES, { staticDir });

    expect(await (await backlog.request("/assets/app.js")).text()).toContain("app");
    const page = await backlog.request("/p/spa/t/SPA-1");
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("Беклог");
  });

  it("запрещает встраивать страницу в чужой iframe и угадывать тип содержимого", async () => {
    const staticDir = await makeTempDir();
    await writeFiles(staticDir, { "index.html": "<!doctype html><title>Беклог</title>" });
    const backlog = await makeTestApp(SAMPLE_FILES, { staticDir });

    for (const response of [await backlog.request("/p/spa"), await backlog.request("/api/tasks")]) {
      expect(response.headers.get("x-frame-options")).toBe("DENY");
      expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    }
  });
});

describe("неактивные проекты", () => {
  it("не входят в общую статистику, но открываются напрямую; список задач отдаёт все", async () => {
    const backlog = await makeTestApp({
      "spa/project.md": projectFile("SPA"),
      "spa/SPA-1.md": taskFile("SPA-1"),
      "torg-io/project.md": projectFile("TI", [], { active: false }),
      "torg-io/TI-1.md": taskFile("TI-1"),
    });

    const all = (await (await backlog.request("/api/stats")).json()) as StatsReport;
    expect(all.taskCount).toBe(1);

    const scoped = (await (await backlog.request("/api/stats?project=torg-io")).json()) as StatsReport;
    expect(scoped.taskCount).toBe(1);

    const { tasks } = (await (await backlog.request("/api/tasks")).json()) as TasksResponse;
    expect(tasks.map((task) => task.id)).toEqual(["SPA-1", "TI-1"]);
  });
});

describe("PATCH и DELETE /api/projects/:id", () => {
  it("меняют активность и удаляют проект только с точным подтверждением", async () => {
    const backlog = await makeTestApp(SAMPLE_FILES);

    const patched = await backlog.json("/api/projects/spa", "PATCH", { active: false });
    expect(patched.status).toBe(200);
    expect((await patched.json()) as Project).toMatchObject({ id: "spa", active: false });

    const wrong = await backlog.json("/api/projects/spa", "DELETE", { confirm: "SPA" });
    expect(wrong.status).toBe(422);
    expect((await loadBacklog(backlog.root)).projects.map((project) => project.id)).toContain("spa");

    const deleted = await backlog.json("/api/projects/spa", "DELETE", { confirm: "spa" });
    expect(deleted.status).toBe(200);
    expect((await loadBacklog(backlog.root)).projects.map((project) => project.id)).toEqual(["torg-io"]);

    expect((await backlog.json("/api/projects/spa", "PATCH", { active: true })).status).toBe(404);
    expect((await backlog.json("/api/projects/spa", "DELETE", { confirm: "spa" })).status).toBe(404);
  });

  it("id проекта не выводит за каталог беклога", async () => {
    const backlog = await makeTestApp(SAMPLE_FILES);
    const outside = await makeTempDir();
    await writeFiles(outside, { "project.md": projectFile("OUT") });
    const escapingId = relative(backlog.root, outside);

    const url = `/api/projects/${encodeURIComponent(escapingId)}`;
    expect((await backlog.json(url, "PATCH", { active: false })).status).toBe(404);
    expect((await backlog.json(url, "DELETE", { confirm: escapingId })).status).toBe(404);
    expect(await readFile(join(outside, "project.md"), "utf8")).toBe(projectFile("OUT"));
  });
});

describe("тело запроса", () => {
  it("неразобранный JSON отличается от несовпадения со схемой", async () => {
    const backlog = await makeTestApp(SAMPLE_FILES);

    const broken = await backlog.request("/api/tasks/SPA-1", { method: "PATCH", body: "{", headers: { "content-type": "application/json" } });
    expect(broken.status).toBe(400);
    expect(((await broken.json()) as ErrorResponse).errors[0]).toContain("не разобрано");

    const wrongShape = await backlog.json("/api/tasks/SPA-1", "PATCH", { version: 1 });
    expect(wrongShape.status).toBe(422);
  });
});

describe("язык", () => {
  it("PATCH /api/settings меняет язык ошибок API и сохраняется", async () => {
    const backlog = await makeTestApp(SAMPLE_FILES);
    expect((await backlog.json("/api/settings", "PATCH", { language: "en" })).status).toBe(200);
    const version = await backlog.taskVersion("SPA-1");
    const response = await backlog.json("/api/tasks/SPA-1", "PATCH", { version, changes: { blockedBy: ["SPA-1"] } });
    expect(((await response.json()) as ErrorResponse).errors).toEqual(["a task cannot block itself"]);
    expect(await (await backlog.request("/api/settings")).json()).toEqual({ language: "en" });
  });

  it("неизвестный язык — 422, настройка не меняется", async () => {
    const backlog = await makeTestApp(SAMPLE_FILES);

    const response = await backlog.json("/api/settings", "PATCH", { language: "fr" });

    expect(response.status).toBe(422);
    expect(await (await backlog.request("/api/settings")).json()).toEqual({ language: "ru" });
  });
});

describe("неожиданная ошибка сервера", () => {
  it("отдаётся тем же JSON, что и остальные ошибки API", async () => {
    const backlog = await makeTestApp(SAMPLE_FILES);
    backlog.usage.snapshot = () => {
      throw new Error("сканер расшифровок упал");
    };

    const response = await backlog.request("/api/stats/cost");

    expect(response.status).toBe(500);
    expect((await response.json()) as ErrorResponse).toEqual({ errors: ["сканер расшифровок упал"] });
  });

  it("занятый другим процессом файл — 503 с понятным текстом, а не поломка сервера", async () => {
    const backlog = await makeTestApp(SAMPLE_FILES);
    backlog.usage.snapshot = () => {
      throw new FileBusyError("/backlog/spa/SPA-1.md", "/backlog/spa/.SPA-1.md.lock", 5);
    };

    const response = await backlog.request("/api/stats/cost");

    expect(response.status).toBe(503);
    expect((await response.json()) as ErrorResponse).toEqual({ errors: ["/backlog/spa/SPA-1.md занят другим процессом дольше 5 с (/backlog/spa/.SPA-1.md.lock)"] });
  });
});
