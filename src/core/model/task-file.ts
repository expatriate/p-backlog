import { parseFrontmatter, stringifyFrontmatter } from "./frontmatter";
import { taskFrontmatterSchema, type ParseResult, type Task } from "./types";

export type TaskLocation = { projectId: string; path: string; version: string };

export type TaskDraft = Omit<Task, "version">;

const TASK_FIELDS = Object.keys(taskFrontmatterSchema.shape) as (keyof typeof taskFrontmatterSchema.shape)[];

export function parseTaskFile(text: string, location: TaskLocation): ParseResult<Task> {
  const parsed = parseTaskFields(text);
  return parsed.ok ? { ok: true, value: { ...parsed.value, ...location } } : parsed;
}

export function parseTaskFields(text: string): ParseResult<Omit<Task, keyof TaskLocation>> {
  const parsed = parseFrontmatter(text, taskFrontmatterSchema);
  if (!parsed.ok) return parsed;
  const { data, extra, body } = parsed.value;
  return { ok: true, value: { ...data, extra, body } };
}

export function serializeTask(task: TaskDraft): string {
  const known = Object.fromEntries(TASK_FIELDS.map((field) => [field, task[field]]));
  return stringifyFrontmatter({ ...known, ...task.extra }, task.body);
}
