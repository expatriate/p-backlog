import { describe, expect, it } from "vitest";
import type { TokenCounts } from "./token-counts";
import { costOf, fastModel } from "./pricing";

const MILLION: TokenCounts = { input: 1_000_000, cacheWrite5m: 1_000_000, cacheWrite1h: 1_000_000, cacheRead: 1_000_000, output: 1_000_000 };
const ZERO: TokenCounts = { input: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0, output: 0 };

function priceOf(model: string) {
  const perMillion = (kind: keyof TokenCounts) => costOf(model, { ...ZERO, [kind]: 1_000_000 });
  const input = perMillion("input");
  return input === null ? null : { input, output: perMillion("output"), cacheRead: perMillion("cacheRead") };
}

describe("цены моделей", () => {
  it.each([
    ["claude-fable-5-1", { input: 10, output: 50, cacheRead: 0.25 }],
    ["claude-fable-5", { input: 10, output: 50, cacheRead: 1 }],
    ["claude-mythos-5", { input: 10, output: 50, cacheRead: 1 }],
    ["claude-opus-5-5", { input: 4, output: 20, cacheRead: 0.2 }],
    ["claude-opus-5", { input: 5, output: 25, cacheRead: 0.5 }],
    ["claude-opus-4-8", { input: 5, output: 25, cacheRead: 0.5 }],
    ["claude-opus-4-7", { input: 5, output: 25, cacheRead: 0.5 }],
    ["claude-opus-4-6", { input: 5, output: 25, cacheRead: 0.5 }],
    ["claude-sonnet-5", { input: 2, output: 10, cacheRead: 0.2 }],
    ["claude-sonnet-4-6", { input: 3, output: 15, cacheRead: 0.3 }],
    ["claude-haiku-4-5", { input: 1, output: 5, cacheRead: 0.1 }],
  ])("%s — цена по справочнику", (model, price) => {
    expect(priceOf(model)).toEqual(price);
  });

  it("быстрый режим — по своей цене у claude-opus-5 и claude-opus-5-5", () => {
    expect(priceOf(fastModel("claude-opus-5"))).toMatchObject({ input: 10, output: 50 });
    expect(priceOf(fastModel("claude-opus-5-5"))).toMatchObject({ input: 8, output: 40 });
  });

  it("быстрый режим модели без известной быстрой цены — цена неизвестна", () => {
    expect(priceOf(fastModel("claude-opus-4-8"))).toBeNull();
  });

  it("новая модель с id старой как префиксом не получает цену старой", () => {
    expect(priceOf("claude-sonnet-5-1")).toBeNull();
    expect(priceOf("claude-opus-5-6")).toBeNull();
    expect(priceOf("claude-opus-4-5-20251101")).toBeNull();
  });

  it("дата в конце id и суффикс [1m] отбрасываются", () => {
    expect(priceOf("claude-opus-5-5-20260901")).toEqual({ input: 4, output: 20, cacheRead: 0.2 });
    expect(priceOf("claude-sonnet-5[1m]")).toEqual({ input: 2, output: 10, cacheRead: 0.2 });
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
    const fast = costOf(fastModel("claude-opus-5"), MILLION);
    expect(fast).toBeCloseTo((normal ?? 0) * 2);
  });
});
