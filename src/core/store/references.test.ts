import { describe, expect, it } from "vitest";
import { makeTask } from "../model/testing/make-task";
import { referenceCleanup } from "./references";

const gone = new Set(["SPA-9", "SPA-8"]);
const isGone = (id: string) => gone.has(id);

describe("referenceCleanup", () => {
  it("убирает исчезнувшие задачи из блокеров, связей и эпика", () => {
    const task = makeTask({ id: "SPA-1", blockedBy: ["SPA-9", "SPA-2"], related: ["SPA-8"], epic: "SPA-9" });
    expect(referenceCleanup(task, isGone)).toEqual({ blockedBy: ["SPA-2"], related: [], epic: null });
  });

  it("не трогает эпик, если он на месте", () => {
    const task = makeTask({ id: "SPA-1", related: ["SPA-8", "SPA-3"], epic: "SPA-4" });
    expect(referenceCleanup(task, isGone)).toEqual({ blockedBy: [], related: ["SPA-3"] });
  });

  it("возвращает null, если убирать нечего", () => {
    expect(referenceCleanup(makeTask({ id: "SPA-1", blockedBy: ["SPA-2"], epic: "SPA-4" }), isGone)).toBeNull();
  });
});
