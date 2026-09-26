import { describe, expect, it } from "vitest";
import { createReportCache } from "./report-cache";

describe("кэш отчётов", () => {
  it("повтор по тому же ключу — из кэша; сброс и истечение срока — пересчёт", async () => {
    let clock = 0;
    let computed = 0;
    const cache = createReportCache({ ttlMs: 1000, now: () => clock });
    const report = () => cache.get("stats|spa", async () => ++computed);

    expect([await report(), await report()]).toEqual([1, 1]);

    cache.clear();
    expect(await report()).toBe(2);

    clock = 1001;
    expect(await report()).toBe(3);
    expect(await cache.get("stats|ti", async () => ++computed)).toBe(4);
  });

  it("ошибка расчёта не кэшируется", async () => {
    const cache = createReportCache({ ttlMs: 1000, now: () => 0 });

    await expect(cache.get("k", async () => Promise.reject(new Error("git упал")))).rejects.toThrow("git упал");
    expect(await cache.get("k", async () => "ok")).toBe("ok");
  });

  it("clearTagged убирает только записи с пересекающимися тегами", async () => {
    const cache = createReportCache({ ttlMs: 1000, now: () => 0 });
    let computedA = 0;
    let computedB = 0;
    const a = () => cache.get("a", async () => ++computedA, ["project:a", "project:*"]);
    const b = () => cache.get("b", async () => ++computedB, ["project:b", "project:*"]);

    expect([await a(), await b()]).toEqual([1, 1]);

    cache.clearTagged(["project:a"]);

    expect([await a(), await b()]).toEqual([2, 1]);
  });
});
