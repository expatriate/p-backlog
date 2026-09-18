import { buildIndex } from "../model/graph";
import { integrityErrors } from "../model/integrity";
import { changeStatus, settleLifecycle, type Closure } from "../model/lifecycle";
import { parseTaskFile, serializeTask } from "../model/task-file";
import type { Task } from "../model/types";
import { contentVersion, writeFileAtomic } from "./fs-utils";
import { loadBacklog } from "./load";
import { invalid, type UpdateTaskResult } from "./write-result";

export type TaskChanges = Partial<
  Pick<Task, "title" | "type" | "status" | "priority" | "tags" | "blockedBy" | "related" | "body" | "source" | "verified">
> & {
  epic?: string | null;
};

export type UpdateTaskRequest = { id: string; changes: TaskChanges; expectedVersion?: string; now: Date; closure?: Closure };

const CHANGE_FIELDS = ["title", "type", "priority", "tags", "blockedBy", "related", "body", "source", "verified"] as const;

export async function updateTask(root: string, request: UpdateTaskRequest): Promise<UpdateTaskResult> {
  const { tasks } = await loadBacklog(root);
  return updateTaskIn(tasks, request);
}

export async function updateTaskIn(
  tasks: readonly Task[],
  { id, changes, expectedVersion, now, closure }: UpdateTaskRequest,
): Promise<UpdateTaskResult> {
  const current = tasks.find((task) => task.id === id);
  if (!current) return { ok: false, reason: "not-found" };
  if (expectedVersion !== undefined && expectedVersion !== current.version) return { ok: false, reason: "conflict", current };

  const text = serializeTask(applyChanges(current, changes, now, closure));
  const parsed = parseTaskFile(text, { projectId: current.projectId, path: current.path, version: contentVersion(text) });
  if (!parsed.ok) return invalid([parsed.message]);
  const errors = integrityErrors(parsed.value, buildIndex(tasks));
  if (errors.length > 0) return invalid(errors);

  await writeFileAtomic(current.path, text);
  return { ok: true, task: parsed.value };
}

function applyChanges(task: Task, changes: TaskChanges, now: Date, closure: Closure | undefined): Task {
  const edited = { ...task, ...pickDefined(changes, CHANGE_FIELDS), epic: nextEpic(task.epic, changes.epic) };
  const moved = changes.status === undefined ? edited : changeStatus(edited, changes.status, now, closure);
  return settleLifecycle(moved, now);
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
