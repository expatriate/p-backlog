import { z } from "zod";
import type { GraphState } from "../check/graph-health";
import type { Language } from "../i18n/language";
import { PRIORITIES, RESOLUTIONS, TASK_CATEGORIES, TASK_STATUSES, TASK_TYPES, taskIdSchema, type ParseError, type Project, type Task } from "../model/types";
import { settingsSchema } from "../model/settings";
import type { MemorySample } from "../stats/types";

const idList = z.array(taskIdSchema);

const taskChangesSchema = z.strictObject({
  title: z.string().optional(),
  type: z.enum(TASK_TYPES).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  tags: z.array(z.string()).optional(),
  epic: taskIdSchema.nullable().optional(),
  blockedBy: idList.optional(),
  related: idList.optional(),
  body: z.string().optional(),
  category: z.enum(TASK_CATEGORIES).nullable().optional(),
});

export const projectActiveSchema = z.strictObject({ active: z.boolean() });

export const projectDeleteSchema = z.strictObject({ confirm: z.string() });

export const settingsRequestSchema = z.strictObject(settingsSchema.shape);

export const updateTaskRequestSchema = z.strictObject({
  version: z.string().min(1),
  changes: taskChangesSchema,
});

export type TaskChangesRequest = z.infer<typeof taskChangesSchema>;

const batchPreviousSchema = z.strictObject({
  status: z.enum(TASK_STATUSES),
  priority: z.enum(PRIORITIES),
  epic: taskIdSchema.nullable(),
  resolution: z.enum(RESOLUTIONS).nullable(),
  reason: z.string().nullable(),
});

export const batchRequestSchema = z.strictObject({
  tasks: z
    .array(z.strictObject({ id: taskIdSchema, version: z.string().min(1) }))
    .min(1)
    .max(500)
    .refine((tasks) => new Set(tasks.map((task) => task.id)).size === tasks.length),
  action: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("close"), reason: z.string().transform((reason) => reason.replace(/\s*\n\s*/g, " ").trim()).pipe(z.string().min(1)) }),
    z.strictObject({ kind: z.literal("priority"), priority: z.enum(PRIORITIES) }),
    z.strictObject({ kind: z.literal("epic"), epic: taskIdSchema.nullable() }),
    z.strictObject({ kind: z.literal("restore"), changes: z.record(taskIdSchema, batchPreviousSchema) }),
  ]),
});

export type BatchRequest = z.infer<typeof batchRequestSchema>;
export type BatchAction = BatchRequest["action"];
export type BatchPrevious = z.infer<typeof batchPreviousSchema>;
export type BatchSkipReason = "changed" | "not-found" | "already-closed" | "invalid";
/** @public */
export type BatchOutcome =
  | { id: string; outcome: "done"; version: string; previous: BatchPrevious }
  | { id: string; outcome: "skipped"; reason: BatchSkipReason; message: string };
/** @public */
export type BatchResponse = { results: BatchOutcome[] };

type ParseErrorView = Omit<ParseError, "problems"> & { message: string };
export type TasksResponse = { tasks: Task[]; errors: ParseErrorView[] };
export type ProjectView = Project & { codeGraph: GraphState };
export type ProjectDeletedResponse = { deleted: string };
export type ErrorResponse = { errors: string[] };
export type ConflictResponse = ErrorResponse & { current: Task };
export type * from "../stats/types";

export type MemorySamplesResponse = { samples: MemorySample[] };
export type SettingsResponse = { language: Language };
