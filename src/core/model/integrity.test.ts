import { describe, expect, it } from "vitest";
import { buildIndex } from "./graph";
import { integrityErrors, taskWarnings } from "./integrity";
import { makeTask } from "./testing/make-task";

describe("integrityErrors", () => {
  it("корректная задача проходит", () => {
    const epic = makeTask({ id: "SPA-1", type: "epic" });
    const blocker = makeTask({ id: "SPA-2" });
    const task = makeTask({ id: "SPA-3", epic: "SPA-1", blockedBy: ["SPA-2"], related: ["SPA-2"] });
    expect(integrityErrors(task, buildIndex([epic, blocker, task]))).toEqual([]);
  });

  it("запрещает ссылки на саму себя", () => {
    const task = makeTask({ id: "SPA-1", blockedBy: ["SPA-1"], related: ["SPA-1"], epic: "SPA-1" });
    expect(integrityErrors(task, buildIndex([]))).toEqual([
      "задача не может блокировать саму себя",
      "задача не может быть связана сама с собой",
      "задача не может быть своим эпиком",
    ]);
  });

  it("эпик должен существовать и быть эпиком", () => {
    const plain = makeTask({ id: "SPA-1" });
    expect(integrityErrors(makeTask({ id: "SPA-2", epic: "SPA-9" }), buildIndex([plain]))).toEqual(["эпик SPA-9 не найден"]);
    expect(integrityErrors(makeTask({ id: "SPA-2", epic: "SPA-1" }), buildIndex([plain]))).toEqual(["SPA-1 не является эпиком"]);
  });

  it("эпик не вкладывается в эпик", () => {
    const outer = makeTask({ id: "SPA-1", type: "epic" });
    const inner = makeTask({ id: "SPA-2", type: "epic", epic: "SPA-1" });
    expect(integrityErrors(inner, buildIndex([outer]))).toEqual(["эпик не может входить в другой эпик"]);
  });

  it("эпик с дочерними задачами нельзя сделать задачей", () => {
    const epic = makeTask({ id: "SPA-1", type: "epic" });
    const child = makeTask({ id: "SPA-2", epic: "SPA-1" });
    expect(integrityErrors({ ...epic, type: "task" }, buildIndex([epic, child]))).toEqual([
      "на задачу ссылаются как на эпик: SPA-2",
    ]);
  });

  it("находит цикл блокеров через другие задачи, используя новую версию кандидата", () => {
    const a = makeTask({ id: "SPA-1", blockedBy: ["SPA-2"] });
    const b = makeTask({ id: "SPA-2", blockedBy: ["SPA-3"] });
    const c = makeTask({ id: "SPA-3" });
    const cWithCycle = { ...c, blockedBy: ["SPA-1"] };
    expect(integrityErrors(cWithCycle, buildIndex([a, b, c]))).toEqual(["цикл блокеров: SPA-3 → SPA-1 → SPA-2 → SPA-3"]);
  });

  it("resolution только у закрытой задачи и в паре со своим статусом, reason — только с resolution", () => {
    const index = buildIndex([]);
    expect(integrityErrors(makeTask({ id: "SPA-1", status: "done", resolution: "fixed", reason: "есть" }), index)).toEqual([]);
    expect(integrityErrors(makeTask({ id: "SPA-1", status: "cancelled", resolution: "obsolete", reason: "есть" }), index)).toEqual([]);
    expect(integrityErrors(makeTask({ id: "SPA-1", status: "done", resolution: "duplicate", reason: "есть" }), index)).toEqual([
      "resolution duplicate требует статус cancelled",
    ]);
    expect(integrityErrors(makeTask({ id: "SPA-1", resolution: "fixed", reason: "есть" }), index)).toEqual([
      "resolution fixed требует статус done",
    ]);
    expect(integrityErrors(makeTask({ id: "SPA-1", status: "done", reason: "без причины" }), index)).toEqual([
      "reason задаётся только вместе с resolution",
    ]);
  });

  it("не сообщает о цикле, который не проходит через кандидата", () => {
    const a = makeTask({ id: "SPA-1", blockedBy: ["SPA-2"] });
    const b = makeTask({ id: "SPA-2", blockedBy: ["SPA-1"] });
    const c = makeTask({ id: "SPA-3", blockedBy: ["SPA-1"] });
    expect(integrityErrors(c, buildIndex([a, b, c]))).toEqual([]);
  });
});

describe("taskWarnings", () => {
  it("добавляет ненайденные ссылки к нарушениям правил", () => {
    const task = makeTask({ id: "SPA-1", blockedBy: ["SPA-8"], related: ["TI-9"], epic: "SPA-7" });
    expect(taskWarnings(task, buildIndex([task]))).toEqual(["SPA-8 не найдена", "TI-9 не найдена", "эпик SPA-7 не найден"]);
  });
});
