import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ConflictResponse, ErrorResponse, FlowReport, StatsReport, TasksResponse } from "../core/api/contract";
import { readJournal } from "../core/store/journal";
import { makeTempDir, writeFiles } from "../core/store/testing/temp-dirs";
import type { Project, Task } from "../core/model/types";
import { formatLocalIso } from "../core/model/dates";
import { makeTestApp, SAMPLE_FILES, TEST_NOW } from "./testing/test-app";

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

describe("защита локального API", () => {
  it("отклоняет чужой Host и не-JSON тело", async () => {
    const backlog = await makeTestApp(SAMPLE_FILES);

    const foreign = await backlog.app.request("http://example.com/api/tasks", { headers: { host: "example.com" } });
    expect(foreign.status).toBe(403);

    const plain = await backlog.request("/api/tasks/SPA-1", { method: "PATCH", body: "status=done" });
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

describe("GET /api/stats", () => {
  it("отдаёт отчёт по всем проектам и по одному", async () => {
    const backlog = await makeTestApp({
      ...SAMPLE_FILES,
      "spa/journal.jsonl": `${JSON.stringify({ at: "2026-09-18T10:00:00+03:00", task: "SPA-1", via: "cli", kind: "priority", from: "medium", to: "high" })}\nсломано\n`,
    });

    const all = (await (await backlog.request("/api/stats")).json()) as StatsReport;
    const spa = (await (await backlog.request("/api/stats?project=spa")).json()) as StatsReport;

    expect(all.totals.open).toBe(3);
    expect(spa.totals.open).toBe(2);
    expect(spa.invalidJournalLines).toBe(1);
    expect(Date.parse(spa.journalSince ?? "")).toBe(Date.parse("2026-09-18T10:00:00+03:00"));
    expect(spa.weeks).toHaveLength(12);
  });

  it("пустой project — как без параметра, все проекты", async () => {
    const backlog = await makeTestApp(SAMPLE_FILES);

    const response = await backlog.request("/api/stats?project=");

    expect(response.status).toBe(200);
    expect(((await response.json()) as StatsReport).totals.open).toBe(3);
  });

  it("неизвестный проект — 404", async () => {
    const backlog = await makeTestApp(SAMPLE_FILES);

    const response = await backlog.request("/api/stats?project=nope");

    expect(response.status).toBe(404);
    expect(((await response.json()) as ErrorResponse).errors).toEqual(["Проект nope не найден"]);
  });
});

describe("GET /api/stats/flow", () => {
  it("отдаёт отчёт потока по всем проектам и по одному", async () => {
    const backlog = await makeTestApp(SAMPLE_FILES);

    const all = (await (await backlog.request("/api/stats/flow")).json()) as FlowReport;
    const spa = (await (await backlog.request("/api/stats/flow?project=spa")).json()) as FlowReport;

    expect(all.forecast.open).toBe(3);
    expect(spa.forecast.open).toBe(2);
    expect(spa.epics.map((epic) => epic.id)).toEqual(["SPA-3"]);
    expect(spa.wip.weeks).toHaveLength(12);
  });

  it("пустой project — все проекты, неизвестный — 404", async () => {
    const backlog = await makeTestApp(SAMPLE_FILES);

    const empty = await backlog.request("/api/stats/flow?project=");
    const unknown = await backlog.request("/api/stats/flow?project=nope");

    expect(((await empty.json()) as FlowReport).forecast.open).toBe(3);
    expect(unknown.status).toBe(404);
    expect(((await unknown.json()) as ErrorResponse).errors).toEqual(["Проект nope не найден"]);
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
