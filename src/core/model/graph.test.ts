import { describe, expect, it } from "vitest";
import {
  buildIndex,
  dependentTasks,
  epicChildren,
  isBlocked,
  missingReferences,
  openBlockers,
  relatedTasks,
  taskProgress,
} from "./graph";
import { makeTask } from "./testing/make-task";

const ids = (tasks: readonly { id: string }[]) => tasks.map((task) => task.id);

describe("блокеры", () => {
  const open = makeTask({ id: "SPA-1", status: "in-progress" });
  const done = makeTask({ id: "SPA-2", status: "done" });
  const cancelled = makeTask({ id: "SPA-3", status: "cancelled" });
  const blocked = makeTask({ id: "SPA-4", blockedBy: ["SPA-1", "SPA-2", "SPA-3", "SPA-99"] });
  const free = makeTask({ id: "SPA-5", blockedBy: ["SPA-2", "SPA-99"] });
  const index = buildIndex([open, done, cancelled, blocked, free]);

  it("открытые блокеры — существующие и не закрытые", () => {
    expect(ids(openBlockers(blocked, index))).toEqual(["SPA-1"]);
    expect(isBlocked(blocked, index)).toBe(true);
  });

  it("закрытые и ненайденные блокеры не блокируют", () => {
    expect(isBlocked(free, index)).toBe(false);
  });

  it("ненайденные ссылки перечисляются", () => {
    expect(missingReferences(free, index)).toEqual(["SPA-99"]);
  });

  it("обратная сторона блокеров", () => {
    expect(ids(dependentTasks(done, index))).toEqual(["SPA-4", "SPA-5"]);
  });
});

describe("relatedTasks", () => {
  it("объединяет исходящие и входящие связи без дублей", () => {
    const a = makeTask({ id: "SPA-1", related: ["SPA-2", "SPA-404"] });
    const b = makeTask({ id: "SPA-2", related: ["SPA-1"] });
    const c = makeTask({ id: "SPA-3", related: ["SPA-1"] });
    const index = buildIndex([a, b, c]);
    expect(ids(relatedTasks(a, index))).toEqual(["SPA-2", "SPA-3"]);
    expect(ids(relatedTasks(c, index))).toEqual(["SPA-1"]);
  });
});

describe("taskProgress", () => {
  it("done — всегда 100", () => {
    const task = makeTask({ id: "SPA-1", status: "done", body: "- [ ] a" });
    expect(taskProgress(task, buildIndex([task]))).toBe(100);
  });

  it("считает долю отмеченных пунктов чеклиста", () => {
    const task = makeTask({ id: "SPA-1", body: "- [x] a\n- [ ] b\n- [ ] c" });
    expect(taskProgress(task, buildIndex([task]))).toBe(33);
  });

  it("без чеклиста — null", () => {
    const task = makeTask({ id: "SPA-1", status: "in-progress", body: "текст" });
    expect(taskProgress(task, buildIndex([task]))).toBeNull();
  });

  it("эпик — доля done среди незакрытых отменой дочерних задач", () => {
    const epic = makeTask({ id: "SPA-1", type: "epic" });
    const children = [
      makeTask({ id: "SPA-2", epic: "SPA-1", status: "done" }),
      makeTask({ id: "SPA-3", epic: "SPA-1", status: "in-progress", body: "- [x] a" }),
      makeTask({ id: "SPA-4", epic: "SPA-1", status: "cancelled" }),
    ];
    const index = buildIndex([epic, ...children]);
    expect(ids(epicChildren(epic, index))).toEqual(["SPA-2", "SPA-3", "SPA-4"]);
    expect(taskProgress(epic, index)).toBe(50);
  });

  it("эпик без активных дочерних задач — null, закрытый эпик — 100", () => {
    const epic = makeTask({ id: "SPA-1", type: "epic" });
    const cancelledChild = makeTask({ id: "SPA-2", epic: "SPA-1", status: "cancelled" });
    expect(taskProgress(epic, buildIndex([epic, cancelledChild]))).toBeNull();
    expect(taskProgress({ ...epic, status: "done" }, buildIndex([epic]))).toBe(100);
  });
});
