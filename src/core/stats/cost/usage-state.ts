import { z } from "zod";
import { tokenCountsSchema } from "./token-counts";

export const COST_REPORT_DAYS = 30;

const estimatedKindSchema = z.enum(["cli", "skill"]);

export const usageBucketSchema = z.object({
  slot: z.string(),
  cwd: z.string(),
  model: z.string(),
  kind: z.enum(["hook", ...estimatedKindSchema.options]),
  tokens: tokenCountsSchema,
  hookTurns: z.number(),
});

export const transcriptStateSchema = z.object({
  hookOpen: z.boolean(),
  lastModel: z.string().nullable(),
  lastMessageId: z.string().nullable(),
  lastMessageTokens: tokenCountsSchema.nullable().optional(),
  pending: z.record(z.string(), estimatedKindSchema),
  pendingEstimates: z.array(z.object({ kind: estimatedKindSchema, chars: z.number(), slot: z.string(), cwd: z.string() })),
});

export type UsageBucket = z.infer<typeof usageBucketSchema>;
export type TranscriptState = z.infer<typeof transcriptStateSchema>;
