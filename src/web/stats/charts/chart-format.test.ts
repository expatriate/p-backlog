import { describe, expect, it } from "vitest";
import { NBSP } from "../../../core/stats/format";
import { axisDay, axisTime, compactNumber, tooltipDay, tooltipWeek } from "./chart-format";

describe("подписи графиков", () => {
  it("даты и время", () => {
    expect(axisDay("2026-09-21")).toBe("21.09");
    expect(tooltipDay("2026-09-21")).toBe("21 сент.");
    expect(tooltipWeek("2026-09-14")).toBe("неделя с 14 сент.");
    expect(axisTime("2026-09-21T14:05:30+03:00")).toMatch(/^\d{2}:\d{2}$/);
  });

  it("компактные числа", () => {
    expect(compactNumber(340)).toBe("340");
    expect(compactNumber(12_000)).toBe(`12${NBSP}тыс.`);
    expect(compactNumber(1_240_000)).toBe(`1,2${NBSP}млн`);
  });
});
