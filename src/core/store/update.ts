import { integrityErrors } from "../model/integrity";
import { parseTaskFile, serializeTask } from "../model/task-file";
import type { Task } from "../model/types";
import { contentVersion, writeFileAtomic } from "./fs-utils";
import { loadBacklog } from "./load";
import { invalid, type UpdateTaskResult } from "./write-result";

export type TaskChanges = Partial<Pick<Task, "title" | "type" | "status" | "priority" | "tags" | "blockedBy" | "related" | "body">> & {
  epic?: string | null;
};

export type UpdateTaskRequest = { id: string; changes: TaskChanges; expectedVersion?: string };

export async function updateTask(root: string, { id, changes, expectedVersion }: UpdateTaskRequest): Promise<UpdateTaskResult> {
  const { tasks } = await loadBacklog(root);
  const current = tasks.find((task) => task.id === id);
  if (!current) return { ok: false, reason: "not-found" };
  if (expectedVersion !== undefined && expectedVersion !== current.version) return { ok: false, reason: "conflict", current };

  const text = serializeTask(applyChanges(current, changes));
  const parsed = parseTaskFile(text, { projectId: current.projectId, path: current.path, version: contentVersion(text) });
  if (!parsed.ok) return invalid([parsed.message]);
  const errors = integrityErrors(parsed.value, tasks);
  if (errors.length > 0) return invalid(errors);

  await writeFileAtomic(current.path, text);
  return { ok: true, task: parsed.value };
}

function applyChanges(task: Task, { epic, ...fields }: TaskChanges): Task {
  const definedFields = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
  return { ...task, ...definedFields, epic: nextEpic(task.epic, epic) };
}

function nextEpic(current: string | undefined, change: string | null | undefined): string | undefined {
  if (change === null) return undefined;
  return change ?? current;
}
