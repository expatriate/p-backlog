import { describe, expect, it } from "vitest";
import { median, nearestRank } from "./numbers";

describe("числа", () => {
  it("медиана: нечётное число значений — среднее, чётное — среднее двух средних, пусто — null", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });

  it("90% по ближайшему рангу", () => {
    expect(nearestRank([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9)).toBe(9);
    expect(nearestRank([7], 0.9)).toBe(7);
    expect(nearestRank([], 0.9)).toBeNull();
  });
});
