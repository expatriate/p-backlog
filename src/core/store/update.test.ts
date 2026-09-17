import { describe, expect, it } from "vitest";
import { loadBacklog } from "./load";
import { makeTempDir, projectFile, taskFile, writeFiles } from "./testing/temp-dirs";
import { updateTask, type TaskChanges } from "./update";

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

    const result = await updateTask(root, { id: "SPA-2", changes: { status: "in-progress", tags: ["A"], title: undefined }, expectedVersion: before });

    expect(result).toMatchObject({ ok: true, task: { status: "in-progress", tags: ["a"], title: "Задача SPA-2", extra: { owner: "dmitry" } } });
    const after = await version(root, "SPA-2");
    expect(after).not.toBe(before);
    expect(result.ok && result.task.version).toBe(after);
  });

  it("epic: null удаляет эпик", async () => {
    const root = await setup();
    const result = await updateTask(root, { id: "SPA-2", changes: { epic: null } });
    expect(result.ok && result.task.epic).toBeUndefined();
  });

  it("возвращает not-found и conflict", async () => {
    const root = await setup();
    expect(await updateTask(root, { id: "SPA-99", changes: { status: "done" } })).toEqual({ ok: false, reason: "not-found" });
    expect(await updateTask(root, { id: "SPA-2", changes: { status: "done" }, expectedVersion: "устаревшая" })).toMatchObject({
      ok: false,
      reason: "conflict",
      current: { id: "SPA-2", status: "backlog" },
    });
  });

  it("отклоняет нарушение правил и не меняет файл", async () => {
    const root = await setup();
    const before = await version(root, "SPA-2");
    expect(await updateTask(root, { id: "SPA-2", changes: { blockedBy: ["SPA-3"] } })).toEqual({
      ok: false,
      reason: "invalid",
      errors: ["цикл блокеров: SPA-2 → SPA-3 → SPA-2"],
    });
    expect(await updateTask(root, { id: "SPA-1", changes: { type: "task" } })).toMatchObject({ ok: false, reason: "invalid" });
    expect(await version(root, "SPA-2")).toBe(before);
  });

  it("отклоняет значения, не проходящие схему", async () => {
    const root = await setup();
    const result = await updateTask(root, { id: "SPA-2", changes: { status: "later" as never } });
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
    } as unknown as TaskChanges;
    const result = await updateTask(root, { id: "SPA-2", changes });

    expect(result).toMatchObject({ ok: true, task: { id: "SPA-2", status: "done", created: createdBefore, projectId: "spa" } });

    const reloaded = await loadBacklog(root);
    expect(reloaded.errors).toEqual([]);
    expect(reloaded.tasks.find((task) => task.id === "SPA-2")).toMatchObject({
      id: "SPA-2",
      status: "done",
      created: createdBefore,
      projectId: "spa",
    });
  });
});
