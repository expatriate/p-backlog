import { z } from "zod";
import { ID_PATTERN } from "../model/ids";
import { PRIORITIES, TASK_STATUSES, TASK_TYPES, type ParseError, type Task } from "../model/types";

const taskId = z.string().regex(ID_PATTERN, "некорректный ID");
const tagList = z.array(z.string());
const idList = z.array(taskId);

export const taskChangesSchema = z.strictObject({
  title: z.string().optional(),
  type: z.enum(TASK_TYPES).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  tags: tagList.optional(),
  epic: taskId.nullable().optional(),
  blockedBy: idList.optional(),
  related: idList.optional(),
  body: z.string().optional(),
});

export const updateTaskRequestSchema = z.strictObject({
  version: z.string().min(1),
  changes: taskChangesSchema,
});

export const newEpicRequestSchema = z.strictObject({
  projectId: z.string().min(1),
  title: z.string(),
  body: z.string().optional(),
  priority: z.enum(PRIORITIES).optional(),
  tags: tagList.optional(),
  taskIds: idList,
});

export type TaskChangesRequest = z.infer<typeof taskChangesSchema>;
export type NewEpicRequest = z.infer<typeof newEpicRequestSchema>;

export type TasksResponse = { tasks: Task[]; errors: ParseError[] };
export type EpicResponse = { epic: Task; tasks: Task[] };
export type ErrorResponse = { errors: string[] };
export type ConflictResponse = ErrorResponse & { current: Task };
export type PartialEpicResponse = ErrorResponse & { epic: Task };
