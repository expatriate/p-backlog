import { describe, expect, it } from "vitest";
import { makeTask } from "../model/testing/make-task";
import { isReviewable } from "./reviewed-task";

describe("isReviewable", () => {
  it("проверяются только задачи в backlog и blocked, без эпиков", () => {
    expect(isReviewable(makeTask({ id: "SPA-1" }))).toBe(true);
    expect(isReviewable(makeTask({ id: "SPA-1", status: "blocked" }))).toBe(true);
    expect(isReviewable(makeTask({ id: "SPA-1", status: "in-progress" }))).toBe(false);
    expect(isReviewable(makeTask({ id: "SPA-1", status: "done" }))).toBe(false);
    expect(isReviewable(makeTask({ id: "SPA-1", type: "epic" }))).toBe(false);
  });
});
