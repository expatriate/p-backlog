import { describe, expect, it } from "vitest";
import { NBSP } from "../../../core/i18n/plural";
import { axisDay, axisTime, compactNumber, tooltipDay } from "./chart-format";

describe("подписи графиков", () => {
  it("даты и время", () => {
    expect(axisDay("ru", "2026-09-21")).toBe("21.09");
    expect(tooltipDay("ru", "2026-09-21")).toBe("21 сент.");
    expect(axisTime("ru", "2026-09-21T14:05:30+03:00")).toMatch(/^\d{2}:\d{2}$/);
  });

  it("компактные числа", () => {
    expect(compactNumber("ru", 340)).toBe("340");
    expect(compactNumber("ru", 12_000)).toBe(`12${NBSP}тыс.`);
    expect(compactNumber("ru", 1_240_000)).toBe(`1,2${NBSP}млн`);
  });
});
