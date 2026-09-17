import { buildIndex } from "../model/graph";
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

const CHANGE_FIELDS = ["title", "type", "status", "priority", "tags", "blockedBy", "related", "body"] as const;

export async function updateTask(root: string, { id, changes, expectedVersion }: UpdateTaskRequest): Promise<UpdateTaskResult> {
  const { tasks } = await loadBacklog(root);
  const current = tasks.find((task) => task.id === id);
  if (!current) return { ok: false, reason: "not-found" };
  if (expectedVersion !== undefined && expectedVersion !== current.version) return { ok: false, reason: "conflict", current };

  const text = serializeTask(applyChanges(current, changes));
  const parsed = parseTaskFile(text, { projectId: current.projectId, path: current.path, version: contentVersion(text) });
  if (!parsed.ok) return invalid([parsed.message]);
  const errors = integrityErrors(parsed.value, buildIndex(tasks));
  if (errors.length > 0) return invalid(errors);

  await writeFileAtomic(current.path, text);
  return { ok: true, task: parsed.value };
}

function applyChanges(task: Task, changes: TaskChanges): Task {
  return { ...task, ...pickDefined(changes, CHANGE_FIELDS), epic: nextEpic(task.epic, changes.epic) };
}

function pickDefined<T extends object, K extends keyof T>(source: T, keys: readonly K[]): Partial<Pick<T, K>> {
  const picked: Partial<Pick<T, K>> = {};
  for (const key of keys) if (source[key] !== undefined) picked[key] = source[key];
  return picked;
}

function nextEpic(current: string | undefined, change: string | null | undefined): string | undefined {
  if (change === null) return undefined;
  return change ?? current;
}
