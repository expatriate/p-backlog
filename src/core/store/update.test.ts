import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { formatLocalIso } from "../model/dates";
import { buildIndex } from "../model/graph";
import { JOURNAL_FILE, readJournal } from "./journal";
import { loadBacklog } from "./load";
import { makeTempDir, projectFile, taskFile, writeFiles } from "./testing/temp-dirs";
import { updateTask } from "./testing/update-task";
import { updateTaskInIndex, type TaskChanges } from "./update";

const NOW = new Date("2026-09-18T12:00:00Z");

async function setup() {
  const root = await makeTempDir();
  await writeFiles(root, {
    "spa/project.md": projectFile("SPA"),
    "spa/SPA-1.md": taskFile("SPA-1", "type: epic\n"),
    "spa/SPA-2.md": taskFile("SPA-2", "epic: SPA-1\nowner: dmitry\n"),
    "spa/SPA-3.md": taskFile("SPA-3", "blockedBy: [SPA-2]\n"),
  });
  return root;
}

async function version(root: string, id: string): Promise<string> {
  const task = (await loadBacklog(root)).tasks.find((candidate) => candidate.id === id);
  if (!task) throw new Error(`нет задачи ${id}`);
  return task.version;
}

describe("updateTask", () => {
  it("меняет поля, сохраняет неизвестные и возвращает новую версию", async () => {
    const root = await setup();
    const before = await version(root, "SPA-2");

    const result = await updateTask(root, { id: "SPA-2", changes: { status: "in-progress", tags: ["A"], title: undefined }, expectedVersion: before, now: NOW, via: "cli" });

    expect(result).toMatchObject({ ok: true, task: { status: "in-progress", tags: ["a"], title: "Задача SPA-2", extra: { owner: "dmitry" } } });
    const after = await version(root, "SPA-2");
    expect(after).not.toBe(before);
    expect(result.ok && result.task.version).toBe(after);
  });

  it("epic: null удаляет эпик", async () => {
    const root = await setup();
    const result = await updateTask(root, { id: "SPA-2", changes: { epic: null }, now: NOW, via: "cli" });
    expect(result.ok && result.task.epic).toBeUndefined();
  });

  it("возвращает not-found и conflict", async () => {
    const root = await setup();
    expect(await updateTask(root, { id: "SPA-99", changes: { status: "done" }, now: NOW, via: "cli" })).toEqual({ ok: false, reason: "not-found" });
    expect(await updateTask(root, { id: "SPA-2", changes: { status: "done" }, expectedVersion: "устаревшая", now: NOW, via: "cli" })).toMatchObject({
      ok: false,
      reason: "conflict",
      current: { id: "SPA-2", status: "backlog" },
    });
  });

  it("файл изменили после загрузки снимка — conflict со свежей задачей, правка на диске сохраняется", async () => {
    const root = await setup();
    const { tasks } = await loadBacklog(root);
    const edited = taskFile("SPA-2", "epic: SPA-1\nstatus: in-progress\n");
    await writeFiles(root, { "spa/SPA-2.md": edited });
    const snapshotVersion = tasks.find((task) => task.id === "SPA-2")?.version;

    const result = await updateTaskInIndex(buildIndex(tasks), { id: "SPA-2", changes: { title: "Новое" }, expectedVersion: snapshotVersion, now: NOW, via: "cli" });

    expect(result).toMatchObject({ ok: false, reason: "conflict", current: { id: "SPA-2", status: "in-progress" } });
    expect(await readFile(join(root, "spa/SPA-2.md"), "utf8")).toBe(edited);
  });

  it("две одновременные правки с одной версией: одна проходит, другая получает conflict, а не затирает первую", async () => {
    const root = await setup();
    const index = buildIndex((await loadBacklog(root)).tasks);
    const expectedVersion = index.byId.get("SPA-2")?.version;

    const results = await Promise.all([
      updateTaskInIndex(index, { id: "SPA-2", changes: { status: "in-progress" }, expectedVersion, now: NOW, via: "web" }),
      updateTaskInIndex(index, { id: "SPA-2", changes: { priority: "high" }, expectedVersion, now: NOW, via: "cli" }),
    ]);

    expect(results.map((result) => (result.ok ? "ok" : result.reason)).sort()).toEqual(["conflict", "ok"]);
    const onDisk = (await loadBacklog(root)).tasks.find((task) => task.id === "SPA-2");
    const winner = results.find((result) => result.ok);
    expect(winner?.ok && onDisk?.version).toBe(winner?.ok && winner.task.version);
  });

  it("файл пропал или перестал разбираться после загрузки снимка — not-found и conflict со снимком", async () => {
    const root = await setup();
    const { tasks } = await loadBacklog(root);
    const index = buildIndex(tasks);
    const version = (id: string) => index.byId.get(id)?.version;
    await rm(join(root, "spa/SPA-3.md"));
    await writeFiles(root, { "spa/SPA-2.md": "сломано" });

    expect(await updateTaskInIndex(index, { id: "SPA-3", changes: { title: "Новое" }, expectedVersion: version("SPA-3"), now: NOW, via: "cli" })).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(await updateTaskInIndex(index, { id: "SPA-2", changes: { title: "Новое" }, expectedVersion: version("SPA-2"), now: NOW, via: "cli" })).toMatchObject({
      ok: false,
      reason: "conflict",
      current: { id: "SPA-2", version: version("SPA-2") },
    });
    expect(await readFile(join(root, "spa/SPA-2.md"), "utf8")).toBe("сломано");
  });

  it("отклоняет нарушение правил и не меняет файл", async () => {
    const root = await setup();
    const before = await version(root, "SPA-2");
    expect(await updateTask(root, { id: "SPA-2", changes: { blockedBy: ["SPA-3"] }, now: NOW, via: "cli" })).toEqual({
      ok: false,
      reason: "invalid",
      errors: ["цикл блокеров: SPA-2 → SPA-3 → SPA-2"],
    });
    expect(await updateTask(root, { id: "SPA-1", changes: { type: "task" }, now: NOW, via: "cli" })).toMatchObject({ ok: false, reason: "invalid" });
    expect(await version(root, "SPA-2")).toBe(before);
  });

  it("отклоняет значения, не проходящие схему", async () => {
    const root = await setup();
    const result = await updateTask(root, { id: "SPA-2", changes: { status: "later" as never }, now: NOW, via: "cli" });
    expect(result).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("игнорирует поля вне списка изменяемых", async () => {
    const root = await setup();
    const createdBefore = (await loadBacklog(root)).tasks.find((task) => task.id === "SPA-2")?.created;

    const changes = {
      status: "done",
      id: "SPA-777",
      created: "2000-01-01T00:00:00+03:00",
      projectId: "evil",
      version: "fake",
      closed: "2000-01-01T00:00:00+03:00",
      resolution: "fixed",
    } as unknown as TaskChanges;
    const result = await updateTask(root, { id: "SPA-2", changes, now: NOW, via: "cli" });

    expect(result).toMatchObject({ ok: true, task: { id: "SPA-2", status: "done", created: createdBefore, projectId: "spa" } });
    expect(result.ok && [result.task.closed, result.task.resolution]).toEqual([formatLocalIso(NOW), undefined]);

    const reloaded = await loadBacklog(root);
    expect(reloaded.errors).toEqual([]);
    expect(reloaded.tasks.find((task) => task.id === "SPA-2")).toMatchObject({
      id: "SPA-2",
      status: "done",
      created: createdBefore,
      projectId: "spa",
    });
  });

  it("закрытие ставит closed, причина пишется только вместе со сменой статуса", async () => {
    const root = await setup();
    const closure = { resolution: "obsolete" as const, reason: "модуль удалён" };

    const closed = await updateTask(root, { id: "SPA-3", changes: { status: "cancelled" }, now: NOW, via: "cli", closure });

    expect(closed).toMatchObject({ ok: true, task: { status: "cancelled", closed: formatLocalIso(NOW), resolution: "obsolete", reason: "модуль удалён" } });
  });

  it("возврат в работу стирает поля закрытия", async () => {
    const root = await setup();
    await updateTask(root, { id: "SPA-3", changes: { status: "cancelled" }, now: NOW, via: "cli", closure: { resolution: "obsolete", reason: "нет" } });

    const reopened = await updateTask(root, { id: "SPA-3", changes: { status: "backlog" }, now: NOW, via: "cli" });

    expect(reopened.ok && [reopened.task.closed, reopened.task.resolution, reopened.task.reason]).toEqual([undefined, undefined, undefined]);
    expect((await loadBacklog(root)).tasks.find((task) => task.id === "SPA-3")?.closed).toBeUndefined();
  });

  it("любая запись закрытой задачи без closed ставит его", async () => {
    const root = await setup();
    await writeFiles(root, { "spa/SPA-4.md": taskFile("SPA-4", "status: done\n") });

    const result = await updateTask(root, { id: "SPA-4", changes: { title: "Новое название" }, now: NOW, via: "cli" });

    expect(result.ok && result.task.closed).toBe(formatLocalIso(NOW));
  });
});

describe("журнал правок", () => {
  it("смена статуса и приоритета пишет события с источником", async () => {
    const root = await setup();

    await updateTask(root, { id: "SPA-3", changes: { status: "in-progress", priority: "high" }, now: NOW, via: "web" });

    const journal = await readJournal(join(root, "spa"), "spa");
    expect(journal.events).toMatchObject([
      { kind: "status", task: "SPA-3", from: "backlog", to: "in-progress", via: "web" },
      { kind: "priority", task: "SPA-3", from: "medium", to: "high", via: "web" },
    ]);
  });

  it("закрытие с причиной записывает причину", async () => {
    const root = await setup();

    await updateTask(root, { id: "SPA-3", changes: { status: "cancelled" }, now: NOW, via: "cli", closure: { resolution: "obsolete", reason: "модуль удалён" } });

    const journal = await readJournal(join(root, "spa"), "spa");
    expect(journal.events).toMatchObject([{ kind: "status", to: "cancelled", resolution: "obsolete", via: "cli" }]);
  });

  it("правка без смены статуса и приоритета журнал не трогает", async () => {
    const root = await setup();

    await updateTask(root, { id: "SPA-3", changes: { title: "Новое название" }, now: NOW, via: "web" });

    expect((await readJournal(join(root, "spa"), "spa")).events).toEqual([]);
  });

  it("ошибка записи журнала не отменяет правку", async () => {
    const root = await setup();
    await mkdir(join(root, "spa", JOURNAL_FILE));
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    onTestFinished(() => errors.mockRestore());

    const result = await updateTask(root, { id: "SPA-3", changes: { status: "done" }, now: NOW, via: "cli" });

    expect(result).toMatchObject({ ok: true, task: { status: "done" } });
  });

  it("категория ставится и убирается, в журнале события category", async () => {
    const root = await setup();

    const set = await updateTask(root, { id: "SPA-3", changes: { category: "couplers" }, now: NOW, via: "web" });
    const cleared = await updateTask(root, { id: "SPA-3", changes: { category: null }, now: NOW, via: "cli" });

    expect(set.ok && set.task.category).toBe("couplers");
    expect(cleared.ok && cleared.task.category).toBeUndefined();
    const journal = await readJournal(join(root, "spa"), "spa");
    expect(journal.events).toEqual([
      expect.objectContaining({ kind: "category", to: "couplers", via: "web" }),
      expect.objectContaining({ kind: "category", from: "couplers", via: "cli" }),
    ]);
    expect(journal.events[0]).not.toHaveProperty("from");
    expect(journal.events[1]).not.toHaveProperty("to");
  });

  it("новый source без якоря сбрасывает якорь, с якорем — записывает его", async () => {
    const root = await setup();
    const anchorOf = async () => (await loadBacklog(root)).tasks.find((task) => task.id === "SPA-3")?.anchor;
    await updateTask(root, { id: "SPA-3", changes: { source: "src/a.ts:1", anchor: "aaaaaaaaaaaa" }, now: NOW, via: "cli" });
    await updateTask(root, { id: "SPA-3", changes: { title: "Другой заголовок" }, now: NOW, via: "web" });
    expect(await anchorOf()).toBe("aaaaaaaaaaaa");

    await updateTask(root, { id: "SPA-3", changes: { source: "src/b.ts:2" }, now: NOW, via: "web" });

    expect(await anchorOf()).toBeUndefined();
  });

  it("подтверждение пишет verified, с новым source — с полем source", async () => {
    const root = await setup();

    await updateTask(root, { id: "SPA-3", changes: { verified: "2026-09-18T15:00:00+03:00" }, now: NOW, via: "cli" });
    await updateTask(root, { id: "SPA-3", changes: { verified: "2026-09-18T16:00:00+03:00", source: "src/a.ts:9" }, now: NOW, via: "cli" });

    const events = (await readJournal(join(root, "spa"), "spa")).events;
    expect(events).toEqual([
      expect.objectContaining({ kind: "verified", via: "cli" }),
      expect.objectContaining({ kind: "verified", source: "src/a.ts:9" }),
    ]);
    expect(events[0]).not.toHaveProperty("source");
  });
});
