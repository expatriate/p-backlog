import { describe, expect, it } from "vitest";
import type { TokenCounts } from "../types";
import { costOf, priceOf } from "./pricing";

const MILLION: TokenCounts = { input: 1_000_000, cacheWrite5m: 1_000_000, cacheWrite1h: 1_000_000, cacheRead: 1_000_000, output: 1_000_000 };
const ZERO: TokenCounts = { input: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0, output: 0 };

describe("цены моделей", () => {
  it("claude-opus-5 — 5 за вход, 25 за выход, 0,5 за чтение кэша", () => {
    expect(priceOf("claude-opus-5")).toEqual({ input: 5, output: 25, cacheRead: 0.5 });
  });

  it("claude-opus-5 в быстром режиме — вдвое дороже входа, выхода и чтения кэша", () => {
    expect(priceOf("claude-opus-5", "fast")).toEqual({ input: 10, output: 50, cacheRead: 1 });
  });

  it("быстрый режим не действует на другие модели", () => {
    expect(priceOf("claude-sonnet-5", "fast")).toEqual({ input: 2, output: 10, cacheRead: 0.2 });
  });

  it("датированный id ищется по префиксу, модель вне таблицы — null", () => {
    expect(priceOf("claude-opus-5-20250601")).toEqual({ input: 5, output: 25, cacheRead: 0.5 });
    expect(priceOf("claude-opus-4-5-20251101")).toBeNull();
  });

  it("суффикс [1m] отбрасывается", () => {
    expect(priceOf("claude-sonnet-5[1m]")).toEqual({ input: 2, output: 10, cacheRead: 0.2 });
  });

  it("более длинный id той же линейки не путается с более коротким", () => {
    expect(priceOf("claude-fable-5-1")).toEqual({ input: 10, output: 50, cacheRead: 0.25 });
    expect(priceOf("claude-fable-5")).toEqual({ input: 10, output: 50, cacheRead: 1 });
  });

  it("<synthetic> — цена неизвестна", () => {
    expect(priceOf("<synthetic>")).toBeNull();
  });
});

describe("стоимость по токенам", () => {
  it("claude-opus-5, по миллиону каждого вида — 46,75", () => {
    expect(costOf("claude-opus-5", MILLION)).toBeCloseTo(5 + 6.25 + 10 + 0.5 + 25);
  });

  it("нулевые токены — нулевая стоимость", () => {
    expect(costOf("claude-opus-5", ZERO)).toBe(0);
  });

  it("модель без цены — null", () => {
    expect(costOf("claude-opus-4-5-20251101", MILLION)).toBeNull();
  });

  it("быстрый режим удваивает стоимость входа и выхода", () => {
    const normal = costOf("claude-opus-5", MILLION);
    const fast = costOf("claude-opus-5", MILLION, "fast");
    expect(fast).toBeCloseTo((normal ?? 0) * 2);
  });
});
