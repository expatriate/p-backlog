import { z } from "zod";
import type { GraphState } from "../check/graph-health";
import { PRIORITIES, TASK_CATEGORIES, TASK_STATUSES, TASK_TYPES, taskIdSchema, type ParseError, type Project, type Task } from "../model/types";
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

export const updateTaskRequestSchema = z.strictObject({
  version: z.string().min(1),
  changes: taskChangesSchema,
});

export type TaskChangesRequest = z.infer<typeof taskChangesSchema>;

export type TasksResponse = { tasks: Task[]; errors: ParseError[] };
export type ProjectView = Project & { codeGraph: GraphState };
export type ProjectDeletedResponse = { deleted: string };
export type ErrorResponse = { errors: string[] };
export type ConflictResponse = ErrorResponse & { current: Task };
export type { CodeReport, CostReport, EffectReport, QualityReport, SignalsReport, StatsReport } from "../stats/types";

export type MemorySamplesResponse = { samples: MemorySample[] };
