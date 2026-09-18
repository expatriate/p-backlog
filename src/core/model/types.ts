import { z } from "zod";
import { ID_PATTERN, PREFIX_PATTERN } from "./ids";

export const TASK_TYPES = ["task", "epic"] as const;
export const TASK_STATUSES = ["backlog", "in-progress", "blocked", "done", "cancelled"] as const;
export const PRIORITIES = ["low", "medium", "high", "critical"] as const;
export const TASK_CATEGORIES = [
  "bloaters",
  "change-preventers",
  "couplers",
  "data-dealers",
  "dispensables",
  "functional-abusers",
  "lexical-abusers",
  "oo-abusers",
  "obfuscators",
  "bug",
] as const;
export const RESOLUTIONS = ["fixed", "obsolete", "duplicate", "epic-done"] as const;

export type TaskType = (typeof TASK_TYPES)[number];
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type Priority = (typeof PRIORITIES)[number];
export type TaskCategory = (typeof TASK_CATEGORIES)[number];
export type Resolution = (typeof RESOLUTIONS)[number];

export function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase();
}

const taskId = z.string().regex(ID_PATTERN, "некорректный ID");
const taskIdList = z
  .array(taskId)
  .default([])
  .transform((ids) => [...new Set(ids)]);

export const taskFrontmatterSchema = z.object({
  id: taskId,
  title: z.string().trim().min(1, "пустой заголовок"),
  type: z.enum(TASK_TYPES).default("task"),
  status: z.enum(TASK_STATUSES).default("backlog"),
  priority: z.enum(PRIORITIES).default("medium"),
  category: z.enum(TASK_CATEGORIES).optional(),
  tags: z
    .array(z.string())
    .default([])
    .transform((tags) => [...new Set(tags.map(normalizeTag).filter(Boolean))]),
  epic: taskId.optional(),
  blockedBy: taskIdList,
  related: taskIdList,
  created: z.iso.datetime({ offset: true }),
  source: z.string().optional(),
  closed: z.iso.datetime({ offset: true }).optional(),
  resolution: z.enum(RESOLUTIONS).optional(),
  reason: z.string().optional(),
  verified: z.iso.datetime({ offset: true }).optional(),
});

export const projectFrontmatterSchema = z.object({
  name: z.string().trim().min(1, "пустое имя проекта"),
  prefix: z.string().regex(PREFIX_PATTERN, "некорректный префикс"),
  repos: z.array(z.string()).default([]),
  issuedUpTo: z.number().int().nonnegative().optional(),
});

type FileExtras = { extra: Record<string, unknown>; body: string; path: string };

export type Task = z.output<typeof taskFrontmatterSchema> & FileExtras & { projectId: string; version: string };

export type Project = z.output<typeof projectFrontmatterSchema> & FileExtras & { id: string };

export type ParseError = { path: string; projectId: string; message: string };

export type ParseResult<T> = { ok: true; value: T } | { ok: false; message: string };
