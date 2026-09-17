import { parseFrontmatter, stringifyFrontmatter } from "./frontmatter";
import { taskFrontmatterSchema, type ParseResult, type Task } from "./types";

export type TaskLocation = { projectId: string; path: string; version: string };

const TASK_FIELDS = Object.keys(taskFrontmatterSchema.shape) as (keyof typeof taskFrontmatterSchema.shape)[];

export function parseTaskFile(text: string, location: TaskLocation): ParseResult<Task> {
  const parsed = parseFrontmatter(text, taskFrontmatterSchema);
  if (!parsed.ok) return parsed;
  const { data, extra, body } = parsed.value;
  return { ok: true, value: { ...data, extra, body, ...location } };
}

export function serializeTask(task: Task): string {
  const known = Object.fromEntries(TASK_FIELDS.map((field) => [field, task[field]]));
  return stringifyFrontmatter({ ...known, ...task.extra }, task.body);
}
