import { describe, expect, it, vi } from "vitest";
import type { ConflictResponse, ErrorResponse, EpicResponse, PartialEpicResponse, TasksResponse } from "../core/api/contract";
import { loadBacklog } from "../core/store/load";
import { makeTempDir, writeFiles } from "../core/store/testing/temp-dirs";
import type { Project, Task } from "../core/model/types";
import { makeTestApp, SAMPLE_FILES } from "./testing/test-app";
import { createEpic } from "../core/store/epics";

vi.mock("../core/store/epics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../core/store/epics")>();
  return { ...actual, createEpic: vi.fn(actual.createEpic) };
});

describe("GET /api/projects и /api/tasks", () => {
  it("отдают проекты, задачи и ошибки разбора", async () => {
    const backlog = await makeTestApp({ ...SAMPLE_FILES, "spa/SPA-9.md": "сломано" });

    const projects = (await (await backlog.request("/api/projects")).json()) as Project[];
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

describe("POST /api/tasks", () => {
  it("создаёт задачу в указанном проекте", async () => {
    const backlog = await makeTestApp(SAMPLE_FILES);

    const response = await backlog.json("/api/tasks", "POST", {
      projectId: "spa",
      title: "Новая задача",
      priority: "critical",
      tags: ["Upload", "network"],
      body: "Описание\n\n- [ ] шаг",
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ id: "SPA-4", priority: "critical", tags: ["upload", "network"], projectId: "spa" });
    expect((await loadBacklog(backlog.root)).tasks.map((task) => task.id)).toContain("SPA-4");
  });

  it("отвечает 404 на неизвестный проект и 422 на нарушение схемы или правил", async () => {
    const backlog = await makeTestApp(SAMPLE_FILES);

    expect((await backlog.json("/api/tasks", "POST", { projectId: "nope", title: "X" })).status).toBe(404);
    expect((await backlog.json("/api/tasks", "POST", { projectId: "spa", title: "X", status: "backlog" })).status).toBe(422);
    expect((await backlog.json("/api/tasks", "POST", { projectId: "spa" })).status).toBe(422);

    const broken = await backlog.json("/api/tasks", "POST", { projectId: "spa", title: "X", epic: "SPA-1" });
    expect(broken.status).toBe(422);
    expect(((await broken.json()) as ErrorResponse).errors).toEqual(["SPA-1 не является эпиком"]);
  });
});

describe("PATCH /api/tasks/:id", () => {
  it("меняет задачу и возвращает новую версию", async () => {
    const backlog = await makeTestApp(SAMPLE_FILES);
    const version = await backlog.taskVersion("SPA-1");

    const response = await backlog.json("/api/tasks/SPA-1", "PATCH", { version, changes: { status: "done", epic: "SPA-3" } });

    expect(response.status).toBe(200);
    const task = (await response.json()) as Task;
    expect(task).toMatchObject({ status: "done", epic: "SPA-3" });
    expect(task.version).not.toBe(version);
  });

  it("отвечает 409 на устаревшую версию и отдаёт актуальную задачу", async () => {
    const backlog = await makeTestApp(SAMPLE_FILES);

    const response = await backlog.json("/api/tasks/SPA-1", "PATCH", { version: "старая", changes: { status: "done" } });

    expect(response.status).toBe(409);
    expect(((await response.json()) as ConflictResponse).current).toMatchObject({ id: "SPA-1", status: "backlog" });
  });

  it("отвечает 404, 422 на неизвестное поле и 422 на нарушение правил", async () => {
    const backlog = await makeTestApp(SAMPLE_FILES);
    const version = await backlog.taskVersion("SPA-1");

    expect((await backlog.json("/api/tasks/SPA-99", "PATCH", { version, changes: {} })).status).toBe(404);
    expect((await backlog.json("/api/tasks/SPA-1", "PATCH", { changes: { status: "done" } })).status).toBe(422);
    expect((await backlog.json("/api/tasks/SPA-1", "PATCH", { version, changes: { id: "SPA-7" } })).status).toBe(422);

    const cycle = await backlog.json("/api/tasks/SPA-1", "PATCH", { version, changes: { blockedBy: ["SPA-2"] } });
    expect(cycle.status).toBe(422);
    expect(((await cycle.json()) as ErrorResponse).errors[0]).toContain("цикл блокеров");
  });
});

describe("POST /api/epics", () => {
  it("создаёт эпик и привязывает к нему задачи", async () => {
    const backlog = await makeTestApp(SAMPLE_FILES);

    const response = await backlog.json("/api/epics", "POST", { projectId: "spa", title: "Загрузка", taskIds: ["SPA-1", "SPA-2"] });

    expect(response.status).toBe(201);
    const { epic, tasks } = (await response.json()) as EpicResponse;
    expect(epic).toMatchObject({ id: "SPA-4", type: "epic" });
    expect(tasks.map((task) => task.epic)).toEqual(["SPA-4", "SPA-4"]);
  });

  it("сообщает 409, если эпик создан, но привязаны не все задачи", async () => {
    const backlog = await makeTestApp(SAMPLE_FILES);
    const loaded = await loadBacklog(backlog.root);
    const epic = loaded.tasks[0];
    if (!epic) throw new Error("нет задач");
    vi.mocked(createEpic).mockResolvedValueOnce({
      ok: false,
      reason: "partial",
      epic: { ...epic, id: "SPA-4", type: "epic" },
      attached: [],
      failedId: "SPA-2",
      errors: ["SPA-2: не найдена"],
    });

    const response = await backlog.json("/api/epics", "POST", { projectId: "spa", title: "X", taskIds: ["SPA-1", "SPA-2"] });

    expect(response.status).toBe(409);
    const body = (await response.json()) as PartialEpicResponse;
    expect(body.errors[0]).toContain("Эпик SPA-4 создан");
    expect(body.epic.id).toBe("SPA-4");
  });

  it("отклоняет задачи другого проекта и эпики", async () => {
    const backlog = await makeTestApp(SAMPLE_FILES);

    const response = await backlog.json("/api/epics", "POST", { projectId: "spa", title: "X", taskIds: ["TI-1", "SPA-3"] });

    expect(response.status).toBe(422);
    expect(((await response.json()) as ErrorResponse).errors).toEqual([
      "TI-1 из другого проекта",
      "SPA-3 — эпик, эпики не вкладываются",
    ]);
  });
});

describe("защита локального API", () => {
  it("отклоняет чужой Host и не-JSON тело", async () => {
    const backlog = await makeTestApp(SAMPLE_FILES);

    const foreign = await backlog.app.request("http://example.com/api/tasks", { headers: { host: "example.com" } });
    expect(foreign.status).toBe(403);

    const plain = await backlog.request("/api/tasks", { method: "POST", body: "projectId=spa" });
    expect(plain.status).toBe(415);
  });
});

describe("GET /api/events", () => {
  it("присылает событие change при изменении каталога", async () => {
    const backlog = await makeTestApp(SAMPLE_FILES);

    const response = await backlog.request("/api/events");
    expect(response.headers.get("content-type")).toContain("text/event-stream");

    const reader = response.body?.getReader();
    if (!reader) throw new Error("нет потока событий");
    backlog.emitChange();
    const chunk = await reader.read();
    expect(new TextDecoder().decode(chunk.value)).toContain("event: change");
    await reader.cancel();
  });
});

describe("статика", () => {
  it("отдаёт файл и возвращает index.html на путь приложения", async () => {
    const staticDir = await makeTempDir();
    await writeFiles(staticDir, {
      "index.html": "<!doctype html><title>Беклог</title>",
      "assets/app.js": "console.log('app');",
    });
    const backlog = await makeTestApp(SAMPLE_FILES, staticDir);

    expect(await (await backlog.request("/assets/app.js")).text()).toContain("app");
    const page = await backlog.request("/p/spa/t/SPA-1");
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("Беклог");
  });
});
