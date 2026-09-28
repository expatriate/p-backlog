import { parseTaskFields, serializeTask, type TaskDraft } from "../model/task-file";
import type { ParseResult, Task } from "../model/types";
import { contentVersion } from "./fs-utils";

export type TaskText = { text: string; task: Task };

export function taskText(draft: TaskDraft): ParseResult<TaskText> {
  const parsed = parseTaskFields(serializeTask(draft));
  if (!parsed.ok) return parsed;
  const normalized = { ...parsed.value, projectId: draft.projectId, path: draft.path };
  const text = serializeTask(normalized);
  return { ok: true, value: { text, task: { ...normalized, version: contentVersion(text) } } };
}
