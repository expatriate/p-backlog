import { describe, expect, it } from "vitest";
import { pluralEn, pluralRu } from "./plural";

describe("множественное число", () => {
  it("русский: 1, 2–4, 5–20, 21, дробные", () => {
    expect([1, 2, 5, 11, 21, 0.5].map((n) => pluralRu(n, "задача", "задачи", "задач"))).toEqual(["задача", "задачи", "задач", "задач", "задача", "задачи"]);
  });
  it("английский: одна и остальные", () => {
    expect([1, 0, 2, 1.5].map((n) => pluralEn(n, "task", "tasks"))).toEqual(["task", "tasks", "tasks", "tasks"]);
  });
});
