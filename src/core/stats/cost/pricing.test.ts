import { describe, expect, it } from "vitest";
import type { TokenCounts } from "./token-counts";
import { costOf, modelKey } from "./pricing";

const MILLION: TokenCounts = { input: 1_000_000, cacheWrite5m: 1_000_000, cacheWrite1h: 1_000_000, cacheRead: 1_000_000, output: 1_000_000 };
const ZERO: TokenCounts = { input: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0, output: 0 };

function fastModel(model: string): string {
  return modelKey({ model, fast: true, tokens: ZERO });
}

function priceOf(model: string) {
  const perMillion = (kind: keyof TokenCounts) => costOf(model, { ...ZERO, [kind]: 1_000_000 });
  const input = perMillion("input");
  return input === null ? null : { input, output: perMillion("output"), cacheRead: perMillion("cacheRead") };
}

describe("цены моделей", () => {
  it("opus-5-5 дешевле opus-5, fable-5-1 отличается от fable-5 только чтением кэша", () => {
    expect(priceOf("claude-opus-5-5")).toEqual({ input: 4, output: 20, cacheRead: 0.2 });
    expect(priceOf("claude-opus-5")).toEqual({ input: 5, output: 25, cacheRead: 0.5 });
    expect(priceOf("claude-fable-5-1")).toEqual({ input: 10, output: 50, cacheRead: 0.25 });
    expect(priceOf("claude-fable-5")).toEqual({ input: 10, output: 50, cacheRead: 1 });
  });

  it("у текущих моделей и их быстрого режима цена известна", () => {
    for (const model of ["claude-fable-5-2", "claude-mythos-5-2", "claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"]) expect(priceOf(model)).not.toBeNull();
    for (const model of ["claude-fable-5-2", "claude-mythos-5-2", "claude-opus-5-5", "claude-opus-5", "claude-opus-4-8"]) expect(priceOf(fastModel(model))).not.toBeNull();
  });

  it("быстрый режим модели без известной быстрой цены — цена неизвестна", () => {
    expect(priceOf(fastModel("claude-opus-4-7"))).toBeNull();
  });

  it("новая модель с id старой как префиксом не получает цену старой", () => {
    expect(priceOf("claude-sonnet-5-1")).toBeNull();
    expect(priceOf("claude-opus-5-6")).toBeNull();
    expect(priceOf("claude-opus-4-1-20250805")).toBeNull();
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
    expect(costOf("claude-opus-4-1-20250805", MILLION)).toBeNull();
  });

  it("быстрый режим удваивает стоимость входа и выхода", () => {
    const normal = costOf("claude-opus-5", MILLION);
    const fast = costOf(fastModel("claude-opus-5"), MILLION);
    expect(fast).toBeCloseTo((normal ?? 0) * 2);
  });
});

describe("цена haiku 5.5 по длине запроса", () => {
  const costOfRequest = (model: string, tokens: TokenCounts) => costOf(modelKey({ model, fast: false, tokens }), tokens);

  it("запрос длиннее 100 000 токенов вместе с кэшем — по старшему тарифу целиком", () => {
    const tokens: TokenCounts = { input: 1_000, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 100_000, output: 1_000 };

    expect(costOfRequest("claude-haiku-5-5", tokens)).toBeCloseTo((1_000 * 0.5 + 100_000 * 0.05 + 1_000 * 2.5) / 1_000_000);
  });

  it("запрос ровно в 100 000 токенов — по младшему тарифу", () => {
    const tokens: TokenCounts = { input: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 100_000, output: 1_000 };

    expect(costOfRequest("claude-haiku-5-5", tokens)).toBeCloseTo((100_000 * 0.01 + 1_000 * 0.5) / 1_000_000);
  });

  it("у моделей с одним тарифом длина запроса цену не меняет", () => {
    const tokens: TokenCounts = { input: 500_000, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0, output: 0 };

    expect(costOfRequest("claude-opus-5-5", tokens)).toBeCloseTo(2);
  });
});
