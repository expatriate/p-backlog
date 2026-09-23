import { describe, expect, it } from "vitest";
import { countEn, countRu, pluralEn, pluralRu } from "./plural";

const NBSP = " ";

describe("множественное число", () => {
  it("русский: 1, 2–4, 5–20, 21, дробные", () => {
    expect([1, 2, 5, 11, 21, 0.5].map((n) => pluralRu(n, "задача", "задачи", "задач"))).toEqual(["задача", "задачи", "задач", "задач", "задача", "задачи"]);
  });
  it("английский: одна и остальные", () => {
    expect([1, 0, 2, 1.5].map((n) => pluralEn(n, "task", "tasks"))).toEqual(["task", "tasks", "tasks", "tasks"]);
  });
});

describe("счёт с числом", () => {
  it("число, неразрывный пробел, форма — по языку", () => {
    expect(countRu(1234, "задача", "задачи", "задач")).toBe(`1${NBSP}234${NBSP}задачи`);
    expect(countEn(1234, "task", "tasks")).toBe(`1,234${NBSP}tasks`);
    expect(countEn(1, "task", "tasks")).toBe(`1${NBSP}task`);
  });
});
