import { promptTokens, type TokenCounts } from "./token-counts";

type ModelPrice = { input: number; output: number; cacheRead: number };

type ModelPricing = ModelPrice & { longPrompt?: ModelPrice; fastMode?: true };

type ModelVariant = { model: string; fast: boolean };

const FAST_MODEL_MARKER = ":fast";
const LONG_PROMPT_MARKER = ":long-prompt";
const LONG_PROMPT_TOKENS = 100_000;
const FAST_PRICE_FACTOR = 2;
const CACHE_WRITE_5M_FACTOR = 1.25;
const CACHE_WRITE_1H_FACTOR = 2;
const TOKENS_PER_PRICE = 1_000_000;

const PRICE_TABLE = new Map<string, ModelPricing>([
  ["claude-fable-5-2", { input: 8, output: 40, cacheRead: 0.2, fastMode: true }],
  ["claude-mythos-5-2", { input: 8, output: 40, cacheRead: 0.2, fastMode: true }],
  ["claude-fable-5-1", { input: 10, output: 50, cacheRead: 0.25 }],
  ["claude-mythos-5-1", { input: 10, output: 50, cacheRead: 0.25 }],
  ["claude-fable-5", { input: 10, output: 50, cacheRead: 1 }],
  ["claude-mythos-5", { input: 10, output: 50, cacheRead: 1 }],
  ["claude-opus-5-5", { input: 4, output: 20, cacheRead: 0.2, fastMode: true }],
  ["claude-opus-5", { input: 5, output: 25, cacheRead: 0.5, fastMode: true }],
  ["claude-opus-4-8", { input: 5, output: 25, cacheRead: 0.5, fastMode: true }],
  ["claude-opus-4-7", { input: 5, output: 25, cacheRead: 0.5 }],
  ["claude-opus-4-6", { input: 5, output: 25, cacheRead: 0.5 }],
  ["claude-opus-4-5", { input: 5, output: 25, cacheRead: 0.5 }],
  ["claude-sonnet-5-5", { input: 2, output: 10, cacheRead: 0.1 }],
  ["claude-sonnet-5", { input: 2, output: 10, cacheRead: 0.2 }],
  ["claude-sonnet-4-6", { input: 3, output: 15, cacheRead: 0.3 }],
  ["claude-sonnet-4-5", { input: 3, output: 15, cacheRead: 0.3 }],
  ["claude-haiku-5-5", { input: 0.1, output: 0.5, cacheRead: 0.01, longPrompt: { input: 0.5, output: 2.5, cacheRead: 0.05 } }],
  ["claude-haiku-4-5", { input: 1, output: 5, cacheRead: 0.1 }],
]);

const DATED_SUFFIX = /-\d{8}$/;
const BRACKET_SUFFIX = /\[[^\]]*\]$/;

export function pricedModelIds(): string[] {
  return [...PRICE_TABLE.keys()];
}

function baseModelId(model: string): string {
  return model.replace(BRACKET_SUFFIX, "").replace(DATED_SUFFIX, "");
}

export function modelKey({ model, fast, tokens }: ModelVariant & { tokens: TokenCounts }): string {
  const longPrompt = promptTokens(tokens) > LONG_PROMPT_TOKENS && PRICE_TABLE.get(baseModelId(model))?.longPrompt !== undefined;
  return `${model}${fast ? FAST_MODEL_MARKER : ""}${longPrompt ? LONG_PROMPT_MARKER : ""}`;
}

function stripMarker(key: string, marker: string): { rest: string; marked: boolean } {
  const marked = key.endsWith(marker);
  return { rest: marked ? key.slice(0, -marker.length) : key, marked };
}

function parseModelKey(key: string): ModelVariant & { longPrompt: boolean } {
  const { rest, marked: longPrompt } = stripMarker(key, LONG_PROMPT_MARKER);
  const { rest: model, marked: fast } = stripMarker(rest, FAST_MODEL_MARKER);
  return { model, fast, longPrompt };
}

export function modelRowKey(key: string): string {
  return stripMarker(key, LONG_PROMPT_MARKER).rest;
}

export function splitFastModel(key: string): ModelVariant {
  const { model, fast } = parseModelKey(key);
  return { model, fast };
}

function priceOf(key: string): ModelPrice | null {
  const { model, fast, longPrompt } = parseModelKey(key);
  const pricing = PRICE_TABLE.get(baseModelId(model));
  if (pricing === undefined) return null;
  const price = longPrompt ? (pricing.longPrompt ?? pricing) : pricing;
  if (!fast) return price;
  if (pricing.fastMode !== true) return null;
  return { input: price.input * FAST_PRICE_FACTOR, output: price.output * FAST_PRICE_FACTOR, cacheRead: price.cacheRead * FAST_PRICE_FACTOR };
}

export function costOf(key: string, tokens: TokenCounts): number | null {
  const price = priceOf(key);
  if (price === null) return null;
  const { input, cacheWrite5m, cacheWrite1h, cacheRead, output } = tokens;
  const total = input * price.input + cacheWrite5m * price.input * CACHE_WRITE_5M_FACTOR + cacheWrite1h * price.input * CACHE_WRITE_1H_FACTOR + cacheRead * price.cacheRead + output * price.output;
  return total / TOKENS_PER_PRICE;
}
