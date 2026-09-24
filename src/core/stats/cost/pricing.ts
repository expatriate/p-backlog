import type { TokenCounts } from "../types";

type ModelPrice = { input: number; output: number; cacheRead: number };

const FAST_MODEL_MARKER = ":fast";
const FAST_PRICE_FACTOR = 2;
const CACHE_WRITE_5M_FACTOR = 1.25;
const CACHE_WRITE_1H_FACTOR = 2;

const PRICE_TABLE = new Map<string, ModelPrice>([
  ["claude-fable-5-1", { input: 10, output: 50, cacheRead: 0.25 }],
  ["claude-mythos-5-1", { input: 10, output: 50, cacheRead: 0.25 }],
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
]);

const FAST_PRICED_MODELS: ReadonlySet<string> = new Set(["claude-opus-5-5", "claude-opus-5"]);

const DATED_SUFFIX = /-\d{8}$/;
const BRACKET_SUFFIX = /\[[^\]]*\]$/;

function baseModelId(model: string): string {
  return model.replace(BRACKET_SUFFIX, "").replace(DATED_SUFFIX, "");
}

export function fastModel(model: string): string {
  return `${model}${FAST_MODEL_MARKER}`;
}

export function splitFastModel(modelKey: string): { model: string; fast: boolean } {
  const fast = modelKey.endsWith(FAST_MODEL_MARKER);
  return { model: fast ? modelKey.slice(0, -FAST_MODEL_MARKER.length) : modelKey, fast };
}

function priceOf(modelKey: string): ModelPrice | null {
  const { model, fast } = splitFastModel(modelKey);
  const baseId = baseModelId(model);
  const price = PRICE_TABLE.get(baseId);
  if (!price) return null;
  if (!fast) return price;
  if (!FAST_PRICED_MODELS.has(baseId)) return null;
  return { input: price.input * FAST_PRICE_FACTOR, output: price.output * FAST_PRICE_FACTOR, cacheRead: price.cacheRead * FAST_PRICE_FACTOR };
}

export function costOf(model: string, tokens: TokenCounts): number | null {
  const price = priceOf(model);
  if (!price) return null;
  const { input, cacheWrite5m, cacheWrite1h, cacheRead, output } = tokens;
  const total = input * price.input + cacheWrite5m * price.input * CACHE_WRITE_5M_FACTOR + cacheWrite1h * price.input * CACHE_WRITE_1H_FACTOR + cacheRead * price.cacheRead + output * price.output;
  return total / 1_000_000;
}
