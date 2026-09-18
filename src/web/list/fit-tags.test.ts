import { describe, expect, it } from "vitest";
import { fittingTagCount } from "./fit-tags";

const fit = (tagWidths: number[], available: number) => fittingTagCount({ tagWidths, moreWidth: 30, gap: 4, available });

describe("сколько тегов влезает в ячейку", () => {
  it("все теги помещаются — видны все, «+N» не нужен", () => {
    expect(fit([96, 100], 200)).toBe(2);
  });

  it("часть не помещается — столько, чтобы влез и «+N»", () => {
    expect(fit([72, 110, 64], 200)).toBe(1);
    expect(fit([60, 60, 60, 60], 200)).toBe(2);
  });

  it("не помещается даже первый тег — ноль", () => {
    expect(fit([250, 40], 200)).toBe(0);
  });

  it("тегов нет — ноль", () => {
    expect(fit([], 200)).toBe(0);
  });
});
