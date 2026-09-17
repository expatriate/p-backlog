import { describe, expect, it } from "vitest";
import { createEpic } from "./epics";
import { loadBacklog } from "./load";
import { makeTempDir, projectFile, taskFile, writeFiles } from "./testing/temp-dirs";

const NOW = new Date("2026-09-17T14:50:00Z");

async function setup() {
  const root = await makeTempDir();
  await writeFiles(root, {
    "spa/project.md": projectFile("SPA"),
    "spa/SPA-1.md": taskFile("SPA-1"),
    "spa/SPA-2.md": taskFile("SPA-2"),
    "spa/SPA-3.md": taskFile("SPA-3", "type: epic\n"),
    "spa/SPA-4.md": taskFile("SPA-4", "epic: SPA-3\n"),
    "torg-io/project.md": projectFile("TI"),
    "torg-io/TI-1.md": taskFile("TI-1"),
  });
  const loaded = await loadBacklog(root);
  const project = loaded.projects.find((candidate) => candidate.id === "spa");
  if (!project) throw new Error("нет проекта spa");
  return { root, project };
}

describe("createEpic", () => {
  it("создаёт эпик и перепривязывает к нему задачи, в том числе из другого эпика", async () => {
    const { root, project } = await setup();

    const result = await createEpic(root, { project, title: "Загрузка", priority: "high", taskIds: ["SPA-1", "SPA-4", "SPA-1"], now: NOW });

    expect(result).toMatchObject({ ok: true, epic: { id: "SPA-5", type: "epic", priority: "high" } });
    const tasks = (await loadBacklog(root)).tasks;
    expect(tasks.filter((task) => task.epic === "SPA-5").map((task) => task.id)).toEqual(["SPA-1", "SPA-4"]);
  });

  it("отклоняет пустой набор, чужой проект, эпики и ненайденные задачи, ничего не создавая", async () => {
    const { root, project } = await setup();

    expect(await createEpic(root, { project, title: "X", taskIds: [], now: NOW })).toEqual({
      ok: false,
      reason: "invalid",
      errors: ["выберите хотя бы одну задачу"],
    });
    expect(await createEpic(root, { project, title: "X", taskIds: ["TI-1", "SPA-3", "SPA-9"], now: NOW })).toEqual({
      ok: false,
      reason: "invalid",
      errors: ["TI-1 из другого проекта", "SPA-3 — эпик, эпики не вкладываются", "SPA-9 не найдена"],
    });
    expect((await loadBacklog(root)).tasks).toHaveLength(5);
  });
});
