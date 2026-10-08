import { dirname } from "node:path";
import { isClosed, type BacklogIndex } from "../model/graph";
import { integrityErrors } from "../model/integrity";
import { changeStatus, isAutoClosedEpic, settleLifecycle, type Closure } from "../model/lifecycle";
import { parseTaskFile } from "../model/task-file";
import type { OptionalFields, Task, TaskCategory, TaskStatus } from "../model/types";
import { changeEvents, statusBeforeAutoClose, type ChangeSource } from "../journal/events";
import { contentVersion, readTextOrNull, writeFileAtomic } from "./fs-utils";
import type { PathErrorHandler } from "../errors";
import { FileBusyError, withFileLock } from "./file-lock";
import { appendingJournal, readJournal, type JournalWriter } from "./journal";
import { taskText } from "./task-text";
import { invalid, type UpdateTaskFailure, type UpdateTaskResult } from "./write-result";

export type TaskChanges = OptionalFields<Pick<Task, "title" | "type" | "status" | "priority" | "tags" | "blockedBy" | "related" | "body" | "source" | "verified">> & {
  epic?: string | null | undefined;
  category?: TaskCategory | null | undefined;
  anchor?: string | null | undefined;
};

export type WriteOrigin = { now: Date; via: ChangeSource; onError: PathErrorHandler; journal?: JournalWriter | undefined };

export type WriteContext = Pick<WriteOrigin, "now" | "onError">;

export type UpdateTaskRequest = WriteOrigin & {
  id: string;
  changes: TaskChanges;
  expectedVersion: string;
  closure?: Closure | undefined;
};

type AppliedSeparately = "status" | "epic" | "category" | "anchor";

const COPIED_CHANGES = { title: true, type: true, priority: true, tags: true, blockedBy: true, related: true, body: true, source: true, verified: true } satisfies Record<
  Exclude<keyof TaskChanges, AppliedSeparately>,
  true
>;

const CHANGE_FIELDS = Object.keys(COPIED_CHANGES) as (keyof typeof COPIED_CHANGES)[];

export async function updateTaskInIndex(index: BacklogIndex, request: UpdateTaskRequest): Promise<UpdateTaskResult> {
  const before = index.byId.get(request.id);
  const result = await writeChanges(index, request);
  if (!result.ok) return result;
  const reopenedEpic = await reopenEpicOfOpenedTask(index, { before, after: result.task }, request);
  return reopenedEpic === undefined ? result : { ...result, reopenedEpic };
}

export async function statusToReopen(epic: Task): Promise<TaskStatus> {
  const { events } = await readJournal(dirname(epic.path), epic.projectId);
  return statusBeforeAutoClose(events, epic.id);
}

type OpenedTask = { before: Task | undefined; after: Task };

export async function reopenEpicOfOpenedTask(index: BacklogIndex, { before, after }: OpenedTask, { now, via, onError, journal }: WriteOrigin): Promise<Task | undefined> {
  if (after.epic === undefined || isClosed(after.status)) return undefined;
  const becameOpenInEpic = before === undefined || isClosed(before.status) || before.epic !== after.epic;
  const epic = index.byId.get(after.epic);
  if (!becameOpenInEpic || epic === undefined || !isAutoClosedEpic(epic)) return undefined;
  try {
    if ((await diskChange(epic, epic.version)) !== null) return undefined;
    const reopened = await writeChanges(index, { id: epic.id, changes: { status: await statusToReopen(epic) }, expectedVersion: epic.version, now, via, onError, journal });
    return reopened.ok ? reopened.task : undefined;
  } catch (error) {
    onError(epic.path, error);
    return undefined;
  }
}

async function writeChanges(index: BacklogIndex, { id, changes, expectedVersion, now, closure, via, onError, journal = appendingJournal(onError) }: UpdateTaskRequest): Promise<UpdateTaskResult> {
  const current = index.byId.get(id);
  if (!current) return { ok: false, reason: "not-found" };
  if (expectedVersion !== current.version) return { ok: false, reason: "conflict", current };

  const normalized = taskText(applyChanges(current, changes, now, closure));
  if (!normalized.ok) return invalid(normalized.problems);
  const { text, task } = normalized.value;
  const problems = integrityErrors(task, index);
  if (problems.length > 0) return invalid(problems);

  return withTaskLock(current.path, async () => {
    const changedOnDisk = await diskChange(current, expectedVersion);
    if (changedOnDisk !== null) return changedOnDisk;
    await writeFileAtomic(current.path, text);
    await journal(dirname(current.path), changeEvents(current, task, now, via));
    return { ok: true, task };
  });
}

async function withTaskLock(path: string, write: () => Promise<UpdateTaskResult>): Promise<UpdateTaskResult> {
  try {
    return await withFileLock(path, write);
  } catch (error) {
    if (!(error instanceof FileBusyError) || error.path !== path) throw error;
    return { ok: false, reason: "busy", path, lock: error.lock, seconds: error.seconds };
  }
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
