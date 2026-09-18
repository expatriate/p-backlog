import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatLocalIso } from "../model/dates";
import { createTask } from "./create";
import { hasErrorCode } from "./fs-utils";
import { loadBacklog } from "./load";
import { sweepClosed } from "./sweep";
import { makeTempDir, projectFile, taskFile, writeFiles } from "./testing/temp-dirs";

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

    expect(report).toEqual({ deleted: ["SPA-1", "SPA-5"], conflicts: [], invalid: [] });
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

    const result = await createTask(root, { project, input: { title: "Новая" }, existingTasks: loaded.tasks, now: NOW });

    expect(result.ok && result.task.id).toBe("SPA-3");
  });

  it("без просроченных задач project.md не переписывается", async () => {
    const root = await makeTempDir();
    const projectText = projectFile("SPA");
    await writeFiles(root, { "spa/project.md": projectText, "spa/SPA-1.md": taskFile("SPA-1", `status: done\n${FRESH}`) });

    expect(await sweepClosed(root, NOW)).toEqual({ deleted: [], conflicts: [], invalid: [] });
    expect(await readFile(join(root, "spa/project.md"), "utf8")).toBe(projectText);
  });

  it("задача, которую нельзя записать по правилам, попадает в invalid с ошибкой, а не в conflicts", async () => {
    const root = await makeTempDir();
    await writeFiles(root, { "spa/project.md": projectFile("SPA"), "spa/SPA-1.md": taskFile("SPA-1", "status: done\nblockedBy: [SPA-1]\n") });

    expect(await sweepClosed(root, NOW)).toEqual({
      deleted: [],
      conflicts: [],
      invalid: [{ id: "SPA-1", errors: ["задача не может блокировать саму себя"] }],
    });
  });
});
