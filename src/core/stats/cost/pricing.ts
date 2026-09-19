import type { TokenCounts } from "../types";

export type ModelPrice = { input: number; output: number; cacheRead: number };

export const PRICES_AS_OF = "2026-06-24";

const FAST_OPUS_5 = "claude-opus-5";

const PRICE_TABLE: Record<string, ModelPrice> = {
  "claude-fable-5-1": { input: 10, output: 50, cacheRead: 0.25 },
  "claude-mythos-5-1": { input: 10, output: 50, cacheRead: 0.25 },
  "claude-fable-5": { input: 10, output: 50, cacheRead: 1 },
  "claude-mythos-5": { input: 10, output: 50, cacheRead: 1 },
  [FAST_OPUS_5]: { input: 5, output: 25, cacheRead: 0.5 },
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

export function priceOf(model: string, speed?: string): ModelPrice | null {
  const stripped = baseModelId(model);
  const key = PRICE_KEYS_BY_LENGTH_DESC.find((candidate) => stripped.startsWith(candidate));
  const price = key ? PRICE_TABLE[key] : undefined;
  if (!price) return null;
  if (key === FAST_OPUS_5 && speed === "fast") return { input: price.input * 2, output: price.output * 2, cacheRead: price.cacheRead * 2 };
  return price;
}

export function costOf(model: string, tokens: TokenCounts, speed?: string): number | null {
  const price = priceOf(model, speed);
  if (!price) return null;
  const { input, cacheWrite5m, cacheWrite1h, cacheRead, output } = tokens;
  const total = input * price.input + cacheWrite5m * price.input * 1.25 + cacheWrite1h * price.input * 2 + cacheRead * price.cacheRead + output * price.output;
  return total / 1_000_000;
}
