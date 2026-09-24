import { z } from "zod";

export const tokenCountsSchema = z.object({
  input: z.number(),
  cacheWrite5m: z.number(),
  cacheWrite1h: z.number(),
  cacheRead: z.number(),
  output: z.number(),
});

export type TokenCounts = z.infer<typeof tokenCountsSchema>;

export const ZERO_TOKENS: TokenCounts = { input: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0, output: 0 };

export function addTokens(a: TokenCounts, b: TokenCounts): TokenCounts {
  return { input: a.input + b.input, cacheWrite5m: a.cacheWrite5m + b.cacheWrite5m, cacheWrite1h: a.cacheWrite1h + b.cacheWrite1h, cacheRead: a.cacheRead + b.cacheRead, output: a.output + b.output };
}

export function tokensGrowth(before: TokenCounts, after: TokenCounts): TokenCounts {
  const grown = (key: keyof TokenCounts) => Math.max(0, after[key] - before[key]);
  return { input: grown("input"), cacheWrite5m: grown("cacheWrite5m"), cacheWrite1h: grown("cacheWrite1h"), cacheRead: grown("cacheRead"), output: grown("output") };
}

export function totalTokens(tokens: TokenCounts): number {
  return tokens.input + tokens.cacheWrite5m + tokens.cacheWrite1h + tokens.cacheRead + tokens.output;
}
