import { describe, expect, it } from "vitest";
import { createLimiter } from "./limit";

describe("createLimiter", () => {
  it("одновременно выполняется не больше заданного числа задач, результаты и ошибки доходят до вызвавших", async () => {
    const limit = createLimiter(3);
    let running = 0;
    let peak = 0;
    const task = (index: number) =>
      limit(async () => {
        running++;
        peak = Math.max(peak, running);
        await new Promise((resolve) => setTimeout(resolve, 1));
        running--;
        if (index === 5) throw new Error("сбой");
        return index;
      });

    const results = await Promise.allSettled(Array.from({ length: 20 }, (_, index) => task(index)));

    expect(peak).toBe(3);
    expect(results.filter((result) => result.status === "fulfilled").map((result) => result.value)).toEqual([...Array(20).keys()].filter((index) => index !== 5));
    expect(results[5]).toMatchObject({ status: "rejected" });
  });
});
