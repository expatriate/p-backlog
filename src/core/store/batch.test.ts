import { mkdir, open, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { batchRequestSchema } from "../api/contract";
import { buildIndex, type BacklogIndex } from "../model/graph";
import type { Project, Task } from "../model/types";
import { applyBatch, type CoreBatchOutcome } from "./batch";
import { createTask } from "./create";
import { readJournal } from "./journal";
import { loadBacklog } from "./load";
import { makeTempDir, projectFile, taskFile, writeFiles } from "./testing/temp-dirs";
import { failOnPathError } from "./testing/path-errors";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, open: vi.fn(actual.open), rm: vi.fn(actual.rm) };
});

const NOW = new Date("2026-09-25T12:00:00Z");

async function failingOnce<A extends unknown[], R, T>(target: (...args: A) => Promise<R>, matches: (...args: A) => boolean, action: () => Promise<T>): Promise<T> {
  const mocked = vi.mocked(target);
  const actual = mocked.getMockImplementation() as (...args: A) => Promise<R>;
  let failed = false;
  mocked.mockImplementation((async (...args: A) => {
    if (failed || !matches(...args)) return actual(...args);
    failed = true;
    throw Object.assign(new Error("ошибка ввода-вывода"), { code: "EIO" });
  }) as never);
  try {
    return await action();
  } finally {
    mocked.mockImplementation(actual as never);
  }
}

const directoriesSyncOnThisOs = process.platform !== "win32";

const AFTER_WRITE_FAILURES = [
  { name: "синхронизация каталога", happensHere: directoriesSyncOnThisOs, inject: <T>(task: Task, action: () => Promise<T>) => failingOnce(open, (target) => target === dirname(task.path), action) },
  { name: "снятие блокировки", happensHere: true, inject: <T>(task: Task, action: () => Promise<T>) => failingOnce(rm, (target) => String(target).endsWith(`.${basename(task.path)}.lock`), action) },
];

async function create(root: string, project: Project, input: Parameters<typeof createTask>[1]["input"]): Promise<Task> {
  const existingTasks = (await loadBacklog(root)).tasks;
  const result = await createTask(root, { project, input, existingTasks, now: NOW, via: "cli", onError: failOnPathError });
  if (!result.ok) throw new Error("не удалось создать задачу в тесте");
  return result.task;
}

async function setup() {
  const root = await makeTempDir();
  await writeFiles(root, { "spa/project.md": projectFile("SPA"), "web/project.md": projectFile("WEB") });
  const { projects } = await loadBacklog(root);
  const spa = projects.find((project) => project.id === "spa");
  const web = projects.find((project) => project.id === "web");
  if (!spa || !web) throw new Error("нет проектов в тесте");

  const epic = await create(root, spa, { title: "Эпик", type: "epic" });
  const t1 = await create(root, spa, { title: "Первая", epic: epic.id });
  const t2 = await create(root, spa, { title: "Вторая" });
  const t3 = await create(root, spa, { title: "Третья" });
  const otherEpic = await create(root, web, { title: "Чужой эпик", type: "epic" });

  return { root, spa, web, epic, t1, t2, t3, otherEpic };
}

async function freshIndex(root: string) {
  return buildIndex((await loadBacklog(root)).tasks);
}

function versionOf(index: BacklogIndex, id: string): string {
  return index.byId.get(id)?.version ?? "";
}

function isDone(outcome: CoreBatchOutcome): outcome is Extract<CoreBatchOutcome, { outcome: "done" }> {
  return outcome.outcome === "done";
}

describe("applyBatch", () => {
  it("эпик закрывается вместе со своими задачами в одной пачке, а без них — нет: у него остались бы открытые задачи", async () => {
    const { root, epic, t1, t2 } = await setup();
    const index = await freshIndex(root);
    const close = (ids: string[]) =>
      applyBatch(index, { tasks: ids.map((id) => ({ id, version: versionOf(index, id) })), action: { kind: "close", reason: "Не актуально" }, now: NOW, onError: failOnPathError });

    const alone = await close([epic.id, t2.id]);
    expect(alone.map((outcome) => [outcome.id, outcome.outcome])).toEqual([
      [epic.id, "skipped"],
      [t2.id, "done"],
    ]);

    const together = await close([epic.id, t1.id]);
    expect(together.map((outcome) => [outcome.id, outcome.outcome])).toEqual([
      [epic.id, "done"],
      [t1.id, "done"],
    ]);
    expect((await freshIndex(root)).byId.get(epic.id)?.status).toBe("cancelled");
  });

  it("закрытие пачки ставит cancelled, obsolete и причину и пишет журнал via web", async () => {
    const { root, t1, t2, t3 } = await setup();
    const index = await freshIndex(root);

    const outcomes = await applyBatch(index, {
      tasks: [t1, t2, t3].map((task) => ({ id: task.id, version: versionOf(index, task.id) })),
      action: { kind: "close", reason: "Не актуально" },
      now: NOW,
      onError: failOnPathError,
    });

    expect(outcomes.every((outcome) => outcome.outcome === "done")).toBe(true);
    const t1Outcome = outcomes.find((outcome) => outcome.id === t1.id);
    expect(t1Outcome).toMatchObject({
      outcome: "done",
      task: { status: "cancelled", resolution: "obsolete", reason: "Не актуально" },
      previous: { status: "backlog", priority: "medium", epic: t1.epic ?? null },
    });

    const reloaded = await loadBacklog(root);
    for (const id of [t1.id, t2.id, t3.id]) {
      expect(reloaded.tasks.find((task) => task.id === id)).toMatchObject({ status: "cancelled", resolution: "obsolete", reason: "Не актуально" });
    }

    const journal = await readJournal(join(root, "spa"), "spa");
    const statusEvents = journal.events.filter((event) => event.kind === "status");
    expect(statusEvents).toHaveLength(3);
    for (const event of statusEvents) expect(event).toMatchObject({ to: "cancelled", via: "web", resolution: "obsolete" });
  });

  it("задача, изменённая на диске после загрузки, пропускается как changed, остальные изменены", async () => {
    const { root, t1, t2, t3 } = await setup();
    const index = await freshIndex(root);

    await writeFiles(root, { [`spa/${t2.id}.md`]: taskFile(t2.id, "priority: high\n") });

    const outcomes = await applyBatch(index, {
      tasks: [t1, t2, t3].map((task) => ({ id: task.id, version: versionOf(index, task.id) })),
      action: { kind: "priority", priority: "critical" },
      now: NOW,
      onError: failOnPathError,
    });

    expect(outcomes.find((outcome) => outcome.id === t2.id)).toMatchObject({ outcome: "skipped", reason: "changed" });
    expect(outcomes.find((outcome) => outcome.id === t1.id)).toMatchObject({ outcome: "done" });
    expect(outcomes.find((outcome) => outcome.id === t3.id)).toMatchObject({ outcome: "done" });
  });

  it("сбой записи одной задачи не теряет итог уже изменённых: она failed, остальные done", async () => {
    const { root, t1, t2, t3 } = await setup();
    const index = await freshIndex(root);
    await rm(t2.path);
    await mkdir(t2.path);

    const outcomes = await applyBatch(index, {
      tasks: [t1, t2, t3].map((task) => ({ id: task.id, version: versionOf(index, task.id) })),
      action: { kind: "priority", priority: "critical" },
      now: NOW,
      onError: failOnPathError,
    });

    expect(outcomes).toMatchObject([
      { id: t1.id, outcome: "done" },
      { id: t2.id, outcome: "skipped", reason: "failed" },
      { id: t3.id, outcome: "done" },
    ]);
    expect((await freshIndex(root)).byId.get(t1.id)?.priority).toBe("critical");
  });

  it.each(AFTER_WRITE_FAILURES.filter(({ happensHere }) => happensHere))(
    "сбой после записи задачи ($name) не делает её failed: она done, в журнале, и её эпик закрывается в той же пачке",
    async ({ inject }) => {
      const { root, epic, t1 } = await setup();
      const index = await freshIndex(root);
      const reported: unknown[] = [];

      const outcomes = await inject(t1, () =>
        applyBatch(index, {
          tasks: [epic, t1].map((task) => ({ id: task.id, version: versionOf(index, task.id) })),
          action: { kind: "close", reason: "Не актуально" },
          now: NOW,
          onError: (_path, error) => reported.push(error),
        }),
      );

      expect(outcomes.map((outcome) => [outcome.id, outcome.outcome])).toEqual([
        [epic.id, "done"],
        [t1.id, "done"],
      ]);
      const statusEvents = (await readJournal(join(root, "spa"), "spa")).events.filter((event) => event.kind === "status");
      expect(statusEvents.map((event) => event.task).sort()).toEqual([epic.id, t1.id].sort());
      expect(reported).toMatchObject([{ code: "EIO" }]);
    },
  );

  it("закрытая задача при закрытии — already-closed", async () => {
    const { root, t1 } = await setup();
    const index1 = await freshIndex(root);
    await applyBatch(index1, { tasks: [{ id: t1.id, version: versionOf(index1, t1.id) }], action: { kind: "close", reason: "Причина" }, now: NOW, onError: failOnPathError });

    const index2 = await freshIndex(root);
    const outcomes = await applyBatch(index2, {
      tasks: [{ id: t1.id, version: versionOf(index2, t1.id) }],
      action: { kind: "close", reason: "Ещё причина" },
      now: NOW,
      onError: failOnPathError,
    });

    expect(outcomes).toEqual([{ id: t1.id, outcome: "skipped", reason: "already-closed" }]);
  });

  it("несуществующий id — not-found", async () => {
    const { root } = await setup();
    const index = await freshIndex(root);

    const outcomes = await applyBatch(index, { tasks: [{ id: "SPA-999", version: "x" }], action: { kind: "priority", priority: "low" }, now: NOW, onError: failOnPathError });

    expect(outcomes).toEqual([{ id: "SPA-999", outcome: "skipped", reason: "not-found" }]);
  });

  it("эпик из чужого проекта — invalid, задача не меняется", async () => {
    const { root, t2, otherEpic } = await setup();
    const index = await freshIndex(root);
    const before = index.byId.get(t2.id);
    if (!before) throw new Error("нет задачи в тесте");

    const outcomes = await applyBatch(index, { tasks: [{ id: t2.id, version: before.version }], action: { kind: "epic", epic: otherEpic.id }, now: NOW, onError: failOnPathError });

    expect(outcomes).toEqual([{ id: t2.id, outcome: "skipped", reason: "invalid", problems: [{ code: "epic-foreign-project", epic: otherEpic.id }] }]);
    const after = (await loadBacklog(root)).tasks.find((task) => task.id === t2.id);
    expect(after?.epic).toBe(before.epic);
    expect(after?.version).toBe(before.version);
  });

  it("перенос в эпик самого эпика — invalid", async () => {
    const { root, epic, otherEpic } = await setup();
    const index = await freshIndex(root);

    const outcomes = await applyBatch(index, {
      tasks: [{ id: epic.id, version: versionOf(index, epic.id) }],
      action: { kind: "epic", epic: otherEpic.id },
      now: NOW,
      onError: failOnPathError,
    });

    expect(outcomes).toEqual([{ id: epic.id, outcome: "skipped", reason: "invalid" }]);
  });

  it("restore возвращает прежние значения и пропускает изменённые после действия", async () => {
    const { root, t1, t2 } = await setup();
    const index1 = await freshIndex(root);

    const closeOutcomes = await applyBatch(index1, {
      tasks: [t1, t2].map((task) => ({ id: task.id, version: versionOf(index1, task.id) })),
      action: { kind: "close", reason: "Не актуально" },
      now: NOW,
      onError: failOnPathError,
    });
    const done = closeOutcomes.filter(isDone);
    expect(done).toHaveLength(2);

    await writeFiles(root, { [`spa/${t1.id}.md`]: taskFile(t1.id, "status: cancelled\nresolution: obsolete\nreason: подделка\npriority: high\n") });

    const index2 = await freshIndex(root);
    const changes = Object.fromEntries(done.map((outcome) => [outcome.id, outcome.previous]));
    const restoreOutcomes = await applyBatch(index2, {
      tasks: done.map((outcome) => ({ id: outcome.id, version: outcome.task.version })),
      action: { kind: "restore", changes },
      now: NOW,
      onError: failOnPathError,
    });

    expect(restoreOutcomes.find((outcome) => outcome.id === t1.id)).toMatchObject({ outcome: "skipped", reason: "changed" });
    const t2Restored = restoreOutcomes.find((outcome) => outcome.id === t2.id);
    expect(t2Restored).toMatchObject({ outcome: "done", task: { status: "backlog" } });
    expect(t2Restored?.outcome === "done" && [t2Restored.task.resolution, t2Restored.task.reason]).toEqual([undefined, undefined]);

    const reloaded = await loadBacklog(root);
    const t2Reloaded = reloaded.tasks.find((task) => task.id === t2.id);
    expect(t2Reloaded).toMatchObject({ status: "backlog" });
    expect(t2Reloaded?.resolution).toBeUndefined();
    expect(t2Reloaded?.reason).toBeUndefined();
    const journal = await readJournal(join(root, "spa"), "spa");
    const t2Statuses = journal.events.flatMap((event) => (event.kind === "status" && event.task === t2.id ? [[event.to, event.undo]] : []));
    expect(t2Statuses).toEqual([
      ["cancelled", undefined],
      ["backlog", true],
    ]);
  });

  it("restore возвращает приоритет и эпик и пишет журнал via web", async () => {
    const { root, epic, t1, t2 } = await setup();
    const undo = async (action: { kind: "priority"; priority: "critical" } | { kind: "epic"; epic: null }) => {
      const before = await freshIndex(root);
      const done = (await applyBatch(before, { tasks: [t1, t2].map((task) => ({ id: task.id, version: versionOf(before, task.id) })), action, now: NOW, onError: failOnPathError })).filter(isDone);
      const changed = await freshIndex(root);
      await applyBatch(changed, {
        tasks: done.map((outcome) => ({ id: outcome.id, version: outcome.task.version })),
        action: { kind: "restore", changes: Object.fromEntries(done.map((outcome) => [outcome.id, outcome.previous])) },
        now: NOW,
        onError: failOnPathError,
      });
      return { changed, restored: await freshIndex(root) };
    };

    const priority = await undo({ kind: "priority", priority: "critical" });
    expect(priority.changed.byId.get(t1.id)?.priority).toBe("critical");
    expect([t1, t2].map((task) => priority.restored.byId.get(task.id)?.priority)).toEqual(["medium", "medium"]);

    const epicMove = await undo({ kind: "epic", epic: null });
    expect(epicMove.changed.byId.get(t1.id)?.epic).toBeUndefined();
    expect(epicMove.restored.byId.get(t1.id)?.epic).toBe(epic.id);
    expect(epicMove.restored.byId.get(t2.id)?.epic).toBeUndefined();

    const journal = await readJournal(join(root, "spa"), "spa");
    const restoredPriorities = journal.events.filter((event) => event.kind === "priority" && event.to === "medium");
    expect(restoredPriorities.map((event) => [event.task, event.via])).toEqual([
      [t1.id, "web"],
      [t2.id, "web"],
    ]);
  });

  it("restore не закрывает открытую задачу ни в done, ни в cancelled", async () => {
    const { root, t2, t3 } = await setup();
    const index = await freshIndex(root);

    const outcomes = await applyBatch(index, {
      tasks: [t2, t3].map((task) => ({ id: task.id, version: versionOf(index, task.id) })),
      action: {
        kind: "restore",
        changes: {
          [t2.id]: { status: "done", priority: "medium", epic: null },
          [t3.id]: { status: "cancelled", priority: "medium", epic: null },
        },
      },
      now: NOW,
      onError: failOnPathError,
    });

    expect(outcomes).toEqual([
      { id: t2.id, outcome: "skipped", reason: "invalid" },
      { id: t3.id, outcome: "skipped", reason: "invalid" },
    ]);
    const reloaded = await loadBacklog(root);
    for (const task of [t2, t3]) expect(reloaded.tasks.find((candidate) => candidate.id === task.id)?.version).toBe(versionOf(index, task.id));
  });
});

describe("batchRequestSchema", () => {
  it("сворачивает переводы строк в причине закрытия и обрезает пробелы", () => {
    const result = batchRequestSchema.safeParse({ tasks: [{ id: "SPA-1", version: "v" }], action: { kind: "close", reason: "  строка\n  один\n  два  " } });
    expect(result.success && result.data.action).toEqual({ kind: "close", reason: "строка один два" });
  });

  it("отклоняет пустую после обрезки причину закрытия", () => {
    const result = batchRequestSchema.safeParse({ tasks: [{ id: "SPA-1", version: "v" }], action: { kind: "close", reason: "   \n  " } });
    expect(result.success).toBe(false);
  });

  it("отклоняет повторяющиеся id и больше 500 задач", () => {
    const duplicate = batchRequestSchema.safeParse({
      tasks: [
        { id: "SPA-1", version: "v" },
        { id: "SPA-1", version: "v2" },
      ],
      action: { kind: "priority", priority: "high" },
    });
    expect(duplicate.success).toBe(false);

    const tooMany = batchRequestSchema.safeParse({
      tasks: Array.from({ length: 501 }, (_, index) => ({ id: `SPA-${index + 1}`, version: "v" })),
      action: { kind: "priority", priority: "high" },
    });
    expect(tooMany.success).toBe(false);
  });
});
