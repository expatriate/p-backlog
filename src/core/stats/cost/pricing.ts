import type { TokenCounts } from "../types";

export type ModelPrice = { input: number; output: number; cacheRead: number };

export const PRICES_AS_OF = "2026-06-24";

const FAST_PRICED_MODEL = "claude-opus-5";
const FAST_MODEL_SUFFIX = " (быстрый режим)";
const FAST_PRICE_FACTOR = 2;
const CACHE_WRITE_5M_FACTOR = 1.25;
const CACHE_WRITE_1H_FACTOR = 2;

const PRICE_TABLE: Record<string, ModelPrice> = {
  "claude-fable-5-1": { input: 10, output: 50, cacheRead: 0.25 },
  "claude-mythos-5-1": { input: 10, output: 50, cacheRead: 0.25 },
  "claude-fable-5": { input: 10, output: 50, cacheRead: 1 },
  "claude-mythos-5": { input: 10, output: 50, cacheRead: 1 },
  [FAST_PRICED_MODEL]: { input: 5, output: 25, cacheRead: 0.5 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-opus-4-7": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-opus-4-6": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-sonnet-4-6": { input: 3, output: 15, cacheRead: 0.3 },
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1 },
};

const PRICE_KEYS_BY_LENGTH_DESC = Object.keys(PRICE_TABLE).sort((a, b) => b.length - a.length);

const DATED_SUFFIX = /-\d{8}$/;
const BRACKET_SUFFIX = /\[[^\]]*\]$/;

function baseModelId(model: string): string {
  return model.replace(BRACKET_SUFFIX, "").replace(DATED_SUFFIX, "");
}

export function fastModel(model: string): string {
  return `${model}${FAST_MODEL_SUFFIX}`;
}

export function priceOf(model: string): ModelPrice | null {
  const fast = model.endsWith(FAST_MODEL_SUFFIX);
  const stripped = baseModelId(fast ? model.slice(0, -FAST_MODEL_SUFFIX.length) : model);
  const key = PRICE_KEYS_BY_LENGTH_DESC.find((candidate) => stripped.startsWith(candidate));
  const price = key ? PRICE_TABLE[key] : undefined;
  if (!price) return null;
  if (fast && key === FAST_PRICED_MODEL) return { input: price.input * FAST_PRICE_FACTOR, output: price.output * FAST_PRICE_FACTOR, cacheRead: price.cacheRead * FAST_PRICE_FACTOR };
  return price;
}

export function costOf(model: string, tokens: TokenCounts): number | null {
  const price = priceOf(model);
  if (!price) return null;
  const { input, cacheWrite5m, cacheWrite1h, cacheRead, output } = tokens;
  const total = input * price.input + cacheWrite5m * price.input * CACHE_WRITE_5M_FACTOR + cacheWrite1h * price.input * CACHE_WRITE_1H_FACTOR + cacheRead * price.cacheRead + output * price.output;
  return total / 1_000_000;
}
