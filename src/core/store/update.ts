import { dirname } from "node:path";
import { buildIndex } from "../model/graph";
import { integrityErrors } from "../model/integrity";
import { changeStatus, settleLifecycle, type Closure } from "../model/lifecycle";
import { parseTaskFile, serializeTask } from "../model/task-file";
import type { Task, TaskCategory } from "../model/types";
import { changeEvents, type ChangeSource } from "../journal/events";
import { contentVersion, readTextOrNull, writeFileAtomic } from "./fs-utils";
import { appendJournal } from "./journal";
import { loadBacklog } from "./load";
import { invalid, type UpdateTaskFailure, type UpdateTaskResult } from "./write-result";

export type TaskChanges = Partial<
  Pick<Task, "title" | "type" | "status" | "priority" | "tags" | "blockedBy" | "related" | "body" | "source" | "verified">
> & {
  epic?: string | null;
  category?: TaskCategory | null;
};

export type UpdateTaskRequest = { id: string; changes: TaskChanges; expectedVersion?: string; now: Date; closure?: Closure; via: ChangeSource };

const CHANGE_FIELDS = ["title", "type", "priority", "tags", "blockedBy", "related", "body", "source", "verified"] as const;

export async function updateTask(root: string, request: UpdateTaskRequest): Promise<UpdateTaskResult> {
  const { tasks } = await loadBacklog(root);
  return updateTaskIn(tasks, request);
}

export async function updateTaskIn(
  tasks: readonly Task[],
  { id, changes, expectedVersion, now, closure, via }: UpdateTaskRequest,
): Promise<UpdateTaskResult> {
  const current = tasks.find((task) => task.id === id);
  if (!current) return { ok: false, reason: "not-found" };
  if (expectedVersion !== undefined && expectedVersion !== current.version) return { ok: false, reason: "conflict", current };

  const text = serializeTask(applyChanges(current, changes, now, closure));
  const parsed = parseTaskFile(text, { projectId: current.projectId, path: current.path, version: contentVersion(text) });
  if (!parsed.ok) return invalid([parsed.message]);
  const errors = integrityErrors(parsed.value, buildIndex(tasks));
  if (errors.length > 0) return invalid(errors);

  const changedOnDisk = expectedVersion === undefined ? null : await diskChange(current, expectedVersion);
  if (changedOnDisk !== null) return changedOnDisk;
  await writeFileAtomic(current.path, text);
  await appendJournal(dirname(current.path), changeEvents(current, parsed.value, now, via));
  return { ok: true, task: parsed.value };
}

async function diskChange(snapshot: Task, expectedVersion: string): Promise<UpdateTaskFailure | null> {
  const text = await readTextOrNull(snapshot.path);
  if (text === null) return { ok: false, reason: "not-found" };
  const version = contentVersion(text);
  if (version === expectedVersion) return null;
  const fresh = parseTaskFile(text, { projectId: snapshot.projectId, path: snapshot.path, version });
  return { ok: false, reason: "conflict", current: fresh.ok ? fresh.value : snapshot };
}

function applyChanges(task: Task, changes: TaskChanges, now: Date, closure: Closure | undefined): Task {
  const edited = {
    ...task,
    ...pickDefined(changes, CHANGE_FIELDS),
    epic: nextOptional(task.epic, changes.epic),
    category: nextOptional(task.category, changes.category),
  };
  const moved = changes.status === undefined ? edited : changeStatus(edited, changes.status, now, closure);
  return settleLifecycle(moved, now);
}

function pickDefined<T extends object, K extends keyof T>(source: T, keys: readonly K[]): Partial<Pick<T, K>> {
  const picked: Partial<Pick<T, K>> = {};
  for (const key of keys) if (source[key] !== undefined) picked[key] = source[key];
  return picked;
}

function nextOptional<T>(current: T | undefined, change: T | null | undefined): T | undefined {
  if (change === null) return undefined;
  return change ?? current;
}
