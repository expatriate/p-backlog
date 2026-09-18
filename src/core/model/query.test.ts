import { describe, expect, it } from "vitest";
import { buildIndex } from "./graph";
import { filterTasks, matchesQuery, normalizeText, pickNextTask, sortTasks } from "./query";
import { makeTask } from "./testing/make-task";

const ids = (tasks: readonly { id: string }[]) => tasks.map((task) => task.id);

describe("поиск", () => {
  it("нормализует регистр и ё", () => {
    expect(normalizeText("Ёлка ЁЖ")).toBe("елка еж");
  });

  it("требует вхождения каждого слова в ID, заголовок или описание", () => {
    const task = makeTask({ id: "SPA-12", title: "Таймауты загрузки", body: "Большие файлы ещё падают" });
    expect(matchesQuery(task, "таймауты еще")).toBe(true);
    expect(matchesQuery(task, "spa-12 файлы")).toBe(true);
    expect(matchesQuery(task, "таймауты сеть")).toBe(false);
    expect(matchesQuery(task, "   ")).toBe(true);
  });
});

describe("filterTasks", () => {
  const tasks = [
    makeTask({ id: "SPA-1", tags: ["upload", "network"], status: "backlog", priority: "high", epic: "SPA-5" }),
    makeTask({ id: "SPA-2", tags: ["upload"], status: "done", blockedBy: ["SPA-3"] }),
    makeTask({ id: "SPA-3", tags: ["network"], status: "in-progress", priority: "low" }),
    makeTask({ id: "SPA-4", status: "backlog", blockedBy: ["SPA-3"] }),
    makeTask({ id: "SPA-5", type: "epic" }),
    makeTask({ id: "TI-1", projectId: "torg-io", tags: ["upload"] }),
  ];
  const index = buildIndex(tasks);

  it("теги — задача содержит все выбранные, без учёта регистра", () => {
    expect(ids(filterTasks(tasks, { tags: ["Upload", "network"] }, index))).toEqual(["SPA-1"]);
  });

  it("проект и статусы; пустой список значений не пропускает ничего, отсутствующий — пропускает всё", () => {
    expect(ids(filterTasks(tasks, { projectId: "spa", statuses: ["backlog", "in-progress"] }, index))).toEqual([
      "SPA-1",
      "SPA-3",
      "SPA-4",
      "SPA-5",
    ]);
    expect(ids(filterTasks(tasks, { projectId: "spa", priorities: [] }, index))).toEqual([]);
    expect(ids(filterTasks(tasks, { priorities: ["high", "low"] }, index))).toEqual(["SPA-1", "SPA-3"]);
  });

  it("эпик: конкретный или «без эпика»", () => {
    expect(ids(filterTasks(tasks, { epic: "SPA-5" }, index))).toEqual(["SPA-1"]);
    expect(ids(filterTasks(tasks, { epic: null, projectId: "spa" }, index))).toEqual(["SPA-2", "SPA-3", "SPA-4", "SPA-5"]);
  });

  it("тип и «только незаблокированные»", () => {
    expect(ids(filterTasks(tasks, { type: "epic" }, index))).toEqual(["SPA-5"]);
    expect(ids(filterTasks(tasks, { onlyUnblocked: true, projectId: "spa" }, index))).toEqual(["SPA-1", "SPA-3", "SPA-5"]);
  });
});

describe("sortTasks", () => {
  const tasks = [
    makeTask({ id: "SPA-1", title: "Бета", priority: "low", status: "done", created: "2026-09-10T10:00:00+03:00" }),
    makeTask({ id: "SPA-2", title: "альфа", priority: "critical", status: "backlog", body: "- [x] a\n- [ ] b", created: "2026-09-12T10:00:00+03:00" }),
    makeTask({ id: "SPA-3", title: "Гамма", priority: "high", status: "in-progress", created: "2026-09-11T10:00:00Z" }),
  ];
  const index = buildIndex(tasks);

  it.each([
    ["created", "desc", ["SPA-2", "SPA-3", "SPA-1"]],
    ["priority", "desc", ["SPA-2", "SPA-3", "SPA-1"]],
    ["status", "asc", ["SPA-3", "SPA-2", "SPA-1"]],
    ["title", "asc", ["SPA-2", "SPA-1", "SPA-3"]],
    ["progress", "desc", ["SPA-1", "SPA-2", "SPA-3"]],
    ["progress", "asc", ["SPA-2", "SPA-1", "SPA-3"]],
    ["id", "asc", ["SPA-1", "SPA-2", "SPA-3"]],
    ["id", "desc", ["SPA-3", "SPA-2", "SPA-1"]],
  ] as const)("%s %s", (key, direction, expected) => {
    expect(ids(sortTasks(tasks, { key, direction }, index))).toEqual(expected);
  });
});

describe("pickNextTask", () => {
  it("берёт незаблокированную задачу backlog с высшим приоритетом, затем самую старую", () => {
    const tasks = [
      makeTask({ id: "SPA-1", priority: "critical", status: "in-progress" }),
      makeTask({ id: "SPA-2", priority: "critical", blockedBy: ["SPA-1"] }),
      makeTask({ id: "SPA-3", priority: "high", created: "2026-09-12T10:00:00+03:00" }),
      makeTask({ id: "SPA-4", priority: "high", created: "2026-09-11T10:00:00+03:00" }),
      makeTask({ id: "SPA-5", priority: "critical", type: "epic" }),
      makeTask({ id: "TI-1", priority: "critical", projectId: "torg-io" }),
    ];
    expect(pickNextTask(tasks, "spa", buildIndex(tasks))?.id).toBe("SPA-4");
  });

  it("возвращает undefined, если брать нечего", () => {
    expect(pickNextTask([], "spa", buildIndex([]))).toBeUndefined();
  });
});
