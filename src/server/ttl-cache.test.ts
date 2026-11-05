import { describe, expect, it } from "vitest";
import { createTtlCache } from "./ttl-cache";

const slotKey = (slot: string) => ({ slot, state: "" });

describe("кэш со сроком жизни", () => {
  it("повтор по тому же ключу — из кэша; сброс и истечение срока — пересчёт", async () => {
    let clock = 0;
    let computed = 0;
    const cache = createTtlCache({ ttlMs: 1000, now: () => clock });
    const report = () => cache.get(slotKey("stats|spa"), async () => ++computed);

    expect([await report(), await report()]).toEqual([1, 1]);

    cache.forgetAll();
    expect(await report()).toBe(2);

    clock = 1001;
    expect(await report()).toBe(3);
    expect(await cache.get(slotKey("stats|ti"), async () => ++computed)).toBe(4);
  });

  it("новое состояние вытесняет прежнее в том же слоте: за время срока жизни записи не копятся", async () => {
    const cache = createTtlCache({ ttlMs: 1000, now: () => 0 });

    for (let revision = 1; revision <= 30; revision += 1) {
      await cache.get({ slot: "cost|*", state: `revision-${revision}` }, async () => revision);
      await cache.get({ slot: "stats|*", state: `revision-${revision}` }, async () => revision);
    }

    expect(cache.size()).toBe(2);
    expect(await cache.get({ slot: "cost|*", state: "revision-30" }, async () => 0)).toBe(30);
  });

  it("истёкшие записи других слотов уходят при следующем запросе", async () => {
    let clock = 0;
    const cache = createTtlCache({ ttlMs: 1000, now: () => clock });
    await cache.get(slotKey("stats|spa"), async () => 1);

    clock = 1001;
    await cache.get(slotKey("stats|ti"), async () => 2);

    expect(cache.size()).toBe(1);
  });

  it("ошибка расчёта не кэшируется", async () => {
    const cache = createTtlCache({ ttlMs: 1000, now: () => 0 });

    await expect(cache.get(slotKey("k"), async () => Promise.reject(new Error("git упал")))).rejects.toThrow("git упал");
    expect(await cache.get(slotKey("k"), async () => "ok")).toBe("ok");
  });

  it("forgetTagged убирает только записи с пересекающимися тегами", async () => {
    const cache = createTtlCache({ ttlMs: 1000, now: () => 0 });
    let computedA = 0;
    let computedB = 0;
    const a = () => cache.get(slotKey("a"), async () => ++computedA, ["project:a", "project:*"]);
    const b = () => cache.get(slotKey("b"), async () => ++computedB, ["project:b", "project:*"]);

    expect([await a(), await b()]).toEqual([1, 1]);

    cache.forgetTagged(["project:a"]);

    expect([await a(), await b()]).toEqual([2, 1]);
  });

  it("отказ устаревшего расчёта после forgetTagged не удаляет свежую запись по тому же ключу", async () => {
    const cache = createTtlCache({ ttlMs: 1000, now: () => 0 });
    let computed = 0;
    const { promise: stale, reject: rejectStale } = Promise.withResolvers<number>();

    const staleResult = cache.get(slotKey("k"), () => stale, ["tag"]);
    cache.forgetTagged(["tag"]);
    const fresh = await cache.get(slotKey("k"), async () => ++computed, ["tag"]);

    rejectStale(new Error("устарел"));
    await expect(staleResult).rejects.toThrow("устарел");

    expect(await cache.get(slotKey("k"), async () => ++computed)).toBe(fresh);
  });
});
