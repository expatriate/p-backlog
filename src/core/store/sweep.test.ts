import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { formatLocalIso } from "../model/dates";
import { createTask } from "./create";
import { hasErrorCode } from "./fs-utils";
import { readJournal } from "./journal";
import { loadBacklog } from "./load";
import { reserveIssuedUpTo } from "./projects";
import { sweepClosed } from "./sweep";
import { makeTempDir, projectFile, taskFile, writeFiles } from "./testing/temp-dirs";

vi.mock("./projects", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./projects")>();
  return { ...actual, reserveIssuedUpTo: vi.fn(actual.reserveIssuedUpTo) };
});

const NOW = new Date("2026-09-18T12:00:00Z");
const EXPIRED = "closed: 2026-09-10T10:00:00+03:00\n";
const FRESH = "closed: 2026-09-15T10:00:00+03:00\n";

async function exists(path: string): Promise<boolean> {
  return readFile(path).then(
    () => true,
    (error: unknown) => {
      if (hasErrorCode(error, "ENOENT")) return false;
      throw error;
    },
  );
}

describe("sweepClosed", () => {
  it("удаляет закрытые больше 7 дней назад, вычищает ссылки на них и резервирует номера", async () => {
    const root = await makeTempDir();
    await writeFiles(root, {
      "spa/project.md": projectFile("SPA"),
      "spa/SPA-1.md": taskFile("SPA-1", `status: done\n${EXPIRED}`),
      "spa/SPA-2.md": taskFile("SPA-2", "blockedBy: [SPA-1]\nrelated: [SPA-1, SPA-3]\n"),
      "spa/SPA-3.md": taskFile("SPA-3", `status: done\n${FRESH}`),
      "spa/SPA-4.md": taskFile("SPA-4", "status: cancelled\n"),
      "spa/SPA-5.md": taskFile("SPA-5", `type: epic\nstatus: done\n${EXPIRED}`),
      "spa/SPA-6.md": taskFile("SPA-6", "epic: SPA-5\n"),
      "spa/SPA-7.md": taskFile("SPA-7"),
    });
    const versionBefore = (await loadBacklog(root)).tasks.find((task) => task.id === "SPA-7")?.version;

    const report = await sweepClosed(root, NOW);

    expect(report).toEqual({ closedEpics: [], blockingFiles: [], deleted: ["SPA-1", "SPA-5"], conflicts: [], invalid: [] });
    expect(await exists(join(root, "spa/SPA-1.md"))).toBe(false);
    expect(await exists(join(root, "spa/SPA-5.md"))).toBe(false);
    const { projects, tasks, errors } = await loadBacklog(root);
    const byId = new Map(tasks.map((task) => [task.id, task]));
    expect(errors).toEqual([]);
    expect(byId.get("SPA-2")).toMatchObject({ blockedBy: [], related: ["SPA-3"] });
    expect(byId.get("SPA-6")?.epic).toBeUndefined();
    expect(byId.get("SPA-4")?.closed).toBe(formatLocalIso(NOW));
    expect(byId.get("SPA-3")?.closed).toBe("2026-09-15T10:00:00+03:00");
    expect(byId.get("SPA-7")?.version).toBe(versionBefore);
    expect(projects[0]?.issuedUpTo).toBe(5);
  });

  it("номер удалённой задачи не выдаётся повторно", async () => {
    const root = await makeTempDir();
    await writeFiles(root, {
      "spa/project.md": projectFile("SPA"),
      "spa/SPA-1.md": taskFile("SPA-1"),
      "spa/SPA-2.md": taskFile("SPA-2", `status: done\n${EXPIRED}`),
    });
    await sweepClosed(root, NOW);
    const loaded = await loadBacklog(root);
    const project = loaded.projects[0];
    if (!project) throw new Error("нет проекта");

    const result = await createTask(root, { project, input: { title: "Новая" }, existingTasks: loaded.tasks, now: NOW, via: "cli" });

    expect(result.ok && result.task.id).toBe("SPA-3");
  });

  it("без просроченных задач project.md не переписывается", async () => {
    const root = await makeTempDir();
    const projectText = projectFile("SPA");
    await writeFiles(root, { "spa/project.md": projectText, "spa/SPA-1.md": taskFile("SPA-1", `status: done\n${FRESH}`) });

    expect(await sweepClosed(root, NOW)).toEqual({ closedEpics: [], blockingFiles: [], deleted: [], conflicts: [], invalid: [] });
    expect(await readFile(join(root, "spa/project.md"), "utf8")).toBe(projectText);
  });

  it("задача, которую нельзя записать по правилам, попадает в invalid с ошибкой, а не в conflicts", async () => {
    const root = await makeTempDir();
    await writeFiles(root, { "spa/project.md": projectFile("SPA"), "spa/SPA-1.md": taskFile("SPA-1", "status: done\nblockedBy: [SPA-1]\n") });

    expect(await sweepClosed(root, NOW)).toEqual({
      closedEpics: [],
      blockingFiles: [],
      deleted: [],
      conflicts: [],
      invalid: [{ id: "SPA-1", errors: ["задача не может блокировать саму себя"] }],
    });
  });

  it("сначала закрывает завершённый эпик, потом удаляет его просроченную задачу; у эпика свой отсчёт", async () => {
    const root = await makeTempDir();
    await writeFiles(root, {
      "spa/project.md": projectFile("SPA"),
      "spa/SPA-1.md": taskFile("SPA-1", "type: epic\n"),
      "spa/SPA-2.md": taskFile("SPA-2", `epic: SPA-1\nstatus: done\n${EXPIRED}`),
    });

    const report = await sweepClosed(root, NOW);

    expect(report).toEqual({ closedEpics: ["SPA-1"], blockingFiles: [], deleted: ["SPA-2"], conflicts: [], invalid: [] });
    expect(await exists(join(root, "spa/SPA-2.md"))).toBe(false);
    const { tasks, errors } = await loadBacklog(root);
    expect(errors).toEqual([]);
    expect(tasks).toEqual([
      expect.objectContaining({
        id: "SPA-1",
        status: "done",
        closed: formatLocalIso(NOW),
        resolution: "epic-done",
        reason: "все задачи эпика закрыты: SPA-2",
      }),
    ]);
  });

  it("просроченная задача завершённого эпика, который не удалось закрыть, ждёт его закрытия", async () => {
    const root = await makeTempDir();
    await writeFiles(root, {
      "spa/project.md": projectFile("SPA"),
      "spa/SPA-1.md": taskFile("SPA-1", "type: epic\nblockedBy: [SPA-1]\n"),
      "spa/SPA-2.md": taskFile("SPA-2", `epic: SPA-1\nstatus: done\n${EXPIRED}`),
    });

    const report = await sweepClosed(root, NOW);

    expect(report).toEqual({
      closedEpics: [],
      blockingFiles: [],
      deleted: [],
      conflicts: [],
      invalid: [{ id: "SPA-1", errors: ["задача не может блокировать саму себя"] }],
    });
    expect(await exists(join(root, "spa/SPA-2.md"))).toBe(true);
    expect((await loadBacklog(root)).projects[0]?.issuedUpTo).toBeUndefined();
  });

  it("просроченная задача эпика, у которого есть открытые задачи, удаляется по сроку; эпик остаётся открытым", async () => {
    const root = await makeTempDir();
    await writeFiles(root, {
      "spa/project.md": projectFile("SPA"),
      "spa/SPA-1.md": taskFile("SPA-1", "type: epic\n"),
      "spa/SPA-2.md": taskFile("SPA-2", `epic: SPA-1\nstatus: done\n${EXPIRED}`),
      "spa/SPA-3.md": taskFile("SPA-3", "epic: SPA-1\n"),
    });

    const report = await sweepClosed(root, NOW);

    expect(report).toEqual({ closedEpics: [], blockingFiles: [], deleted: ["SPA-2"], conflicts: [], invalid: [] });
    expect(await exists(join(root, "spa/SPA-2.md"))).toBe(false);
    const byId = new Map((await loadBacklog(root)).tasks.map((task) => [task.id, task]));
    expect(byId.get("SPA-1")?.status).toBe("backlog");
    expect(byId.get("SPA-3")?.epic).toBe("SPA-1");
  });

  it("неразобранный файл держит эпик своего проекта, но не чужого", async () => {
    const root = await makeTempDir();
    await writeFiles(root, {
      "spa/project.md": projectFile("SPA"),
      "spa/SPA-1.md": taskFile("SPA-1", "type: epic\n"),
      "spa/SPA-2.md": taskFile("SPA-2", `epic: SPA-1\nstatus: done\n${EXPIRED}`),
      "spa/SPA-3.md": "сломано",
      "ti/project.md": projectFile("TI"),
      "ti/TI-1.md": taskFile("TI-1", "type: epic\n"),
      "ti/TI-2.md": taskFile("TI-2", `epic: TI-1\nstatus: done\n${FRESH}`),
      "notes/todo.md": "заметки",
    });

    const report = await sweepClosed(root, NOW);

    expect(report).toEqual({
      closedEpics: ["TI-1"],
      blockingFiles: [join(root, "spa/SPA-3.md")],
      deleted: [],
      conflicts: [],
      invalid: [],
    });
    expect(await exists(join(root, "spa/SPA-2.md"))).toBe(true);
    expect((await loadBacklog(root)).tasks.find((task) => task.id === "SPA-1")?.status).toBe("backlog");
  });

  it("задача, которая не записалась на нескольких шагах, попадает в итог один раз", async () => {
    const root = await makeTempDir();
    await writeFiles(root, {
      "spa/project.md": projectFile("SPA"),
      "spa/SPA-1.md": taskFile("SPA-1", "type: epic\nblockedBy: [SPA-1]\nrelated: [SPA-3]\n"),
      "spa/SPA-2.md": taskFile("SPA-2", `epic: SPA-1\nstatus: done\n${FRESH}`),
      "spa/SPA-3.md": taskFile("SPA-3", `status: done\n${EXPIRED}`),
    });

    expect(await sweepClosed(root, NOW)).toEqual({
      closedEpics: [],
      blockingFiles: [],
      deleted: [],
      conflicts: [],
      invalid: [{ id: "SPA-1", errors: ["задача не может блокировать саму себя"] }],
    });
  });

  it("не удаляет просроченную задачу, пока ссылку на неё не удалось снять: иначе ссылка повиснет навсегда", async () => {
    const root = await makeTempDir();
    await writeFiles(root, {
      "spa/project.md": projectFile("SPA"),
      "spa/SPA-1.md": taskFile("SPA-1", `type: epic\nstatus: done\n${EXPIRED}`),
      "spa/SPA-2.md": taskFile("SPA-2", "epic: SPA-1\nblockedBy: [SPA-2]\n"),
      "spa/SPA-3.md": taskFile("SPA-3", `status: done\n${EXPIRED}`),
    });

    const first = await sweepClosed(root, NOW);
    expect(first.deleted).toEqual(["SPA-3"]);
    expect(await exists(join(root, "spa/SPA-1.md"))).toBe(true);

    await writeFiles(root, { "spa/SPA-2.md": taskFile("SPA-2", "epic: SPA-1\n") });

    expect((await sweepClosed(root, NOW)).deleted).toEqual(["SPA-1"]);
    expect((await loadBacklog(root)).tasks.find((task) => task.id === "SPA-2")?.epic).toBeUndefined();
  });

  it("неразобранный файл, когда закрывать нечего, в итог не попадает", async () => {
    const root = await makeTempDir();
    await writeFiles(root, { "spa/project.md": projectFile("SPA"), "spa/SPA-1.md": taskFile("SPA-1"), "spa/SPA-2.md": "сломано" });

    expect(await sweepClosed(root, NOW)).toEqual({ closedEpics: [], blockingFiles: [], deleted: [], conflicts: [], invalid: [] });
  });

  it("удаление пишет в журнал снимок задачи от имени прохода", async () => {
    const root = await makeTempDir();
    await writeFiles(root, {
      "spa/project.md": projectFile("SPA"),
      "spa/SPA-1.md": taskFile("SPA-1", `status: done\nresolution: fixed\nreason: исправлено\n${EXPIRED}`),
    });

    await sweepClosed(root, NOW);

    const journal = await readJournal(join(root, "spa"), "spa");
    expect(journal.events).toMatchObject([{ kind: "deleted", task: "SPA-1", via: "sweep", snapshot: { status: "done", resolution: "fixed" } }]);
  });

  it("номер не зарезервирован — проход не удаляет задачи этого проекта", async () => {
    const root = await makeTempDir();
    await writeFiles(root, {
      "spa/project.md": projectFile("SPA"),
      "spa/SPA-1.md": taskFile("SPA-1", `status: done\n${EXPIRED}resolution: fixed\nreason: x\n`),
    });
    vi.mocked(reserveIssuedUpTo).mockResolvedValueOnce(false);

    expect((await sweepClosed(root, NOW)).deleted).toEqual([]);
    expect(await exists(join(root, "spa/SPA-1.md"))).toBe(true);
  });
});
