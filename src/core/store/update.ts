import { dirname } from "node:path";
import type { BacklogIndex } from "../model/graph";
import { integrityErrors } from "../model/integrity";
import { changeStatus, settleLifecycle, type Closure } from "../model/lifecycle";
import { parseTaskFile } from "../model/task-file";
import type { OptionalFields, Task, TaskCategory } from "../model/types";
import { changeEvents, type ChangeSource } from "../journal/events";
import { contentVersion, readTextOrNull, writeFileAtomic } from "./fs-utils";
import { withFileLock } from "./file-lock";
import { appendJournal } from "./journal";
import { taskText } from "./task-text";
import { invalid, type UpdateTaskFailure, type UpdateTaskResult } from "./write-result";

export type TaskChanges = OptionalFields<
  Pick<Task, "title" | "type" | "status" | "priority" | "tags" | "blockedBy" | "related" | "body" | "source" | "verified">
> & {
  epic?: string | null | undefined;
  category?: TaskCategory | null | undefined;
  anchor?: string | null | undefined;
};

export type UpdateTaskRequest = { id: string; changes: TaskChanges; expectedVersion?: string | undefined; now: Date; closure?: Closure | undefined; via: ChangeSource };

const CHANGE_FIELDS = ["title", "type", "priority", "tags", "blockedBy", "related", "body", "source", "verified"] as const;

export async function updateTaskInIndex(index: BacklogIndex, { id, changes, expectedVersion, now, closure, via }: UpdateTaskRequest): Promise<UpdateTaskResult> {
  const current = index.byId.get(id);
  if (!current) return { ok: false, reason: "not-found" };
  if (expectedVersion !== undefined && expectedVersion !== current.version) return { ok: false, reason: "conflict", current };

  const normalized = taskText(applyChanges(current, changes, now, closure));
  if (!normalized.ok) return invalid([normalized.message]);
  const { text, task } = normalized.value;
  const errors = integrityErrors(task, index);
  if (errors.length > 0) return invalid(errors);

  return withFileLock(current.path, async () => {
    const changedOnDisk = expectedVersion === undefined ? null : await diskChange(current, expectedVersion);
    if (changedOnDisk !== null) return changedOnDisk;
    await writeFileAtomic(current.path, text);
    await appendJournal(dirname(current.path), changeEvents(current, task, now, via));
    return { ok: true, task };
  });
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
    anchor: nextAnchor(task, changes),
  };
  const moved = changes.status === undefined ? edited : changeStatus(edited, changes.status, now, closure);
  return settleLifecycle(moved, now);
}

function nextAnchor(task: Task, changes: TaskChanges): string | undefined {
  if (changes.anchor !== undefined) return changes.anchor ?? undefined;
  const sourceMoved = changes.source !== undefined && changes.source !== task.source;
  return sourceMoved ? undefined : task.anchor;
}

function pickDefined<T extends object, K extends keyof T>(source: T, keys: readonly K[]): { [P in K]?: Exclude<T[P], undefined> } {
  const picked: { [P in K]?: Exclude<T[P], undefined> } = {};
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined) picked[key] = value as Exclude<T[typeof key], undefined>;
  }
  return picked;
}

function nextOptional<T>(current: T | undefined, change: T | null | undefined): T | undefined {
  if (change === null) return undefined;
  return change ?? current;
}
