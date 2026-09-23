import { parseTaskFile, serializeTask } from "../model/task-file";
import type { ParseResult, Task } from "../model/types";
import { contentVersion } from "./fs-utils";

export type TaskText = { text: string; task: Task };

export function taskText(draft: Task): ParseResult<TaskText> {
  const parsed = parseTaskFile(serializeTask(draft), { projectId: draft.projectId, path: draft.path, version: "" });
  if (!parsed.ok) return parsed;
  const text = serializeTask(parsed.value);
  return { ok: true, value: { text, task: { ...parsed.value, version: contentVersion(text) } } };
}
