import { z } from "zod";

export const MAX_PROBABILITY = 100;
export const probabilitySchema = z.number().int().min(0).max(MAX_PROBABILITY);

export type ProbabilityFilter = { min?: number | undefined; max?: number | undefined } | "none";

export function parseProbability(value: string): number | undefined {
  const text = value.trim();
  return /^\d+$/u.test(text) ? probabilitySchema.safeParse(Number(text)).data : undefined;
}

export function parseProbabilityFilter(value: string | null | undefined): ProbabilityFilter | undefined {
  if (value == null) return undefined;
  if (value === "none") return value;
  const [lower = "", upper, ...rest] = value.split("..").map((part) => part.trim());
  if (upper === undefined || rest.length > 0) return undefined;
  const min = parseProbability(lower);
  const max = parseProbability(upper);
  if ((lower !== "" && min === undefined) || (upper !== "" && max === undefined)) return undefined;
  if ((min === undefined && max === undefined) || (min ?? 0) > (max ?? MAX_PROBABILITY)) return undefined;
  return { min, max };
}

export function formatProbabilityFilter(filter: ProbabilityFilter): string {
  return filter === "none" ? filter : `${filter.min ?? ""}..${filter.max ?? ""}`;
}
