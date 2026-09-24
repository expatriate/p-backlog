import { dirname, join } from "node:path";
import { buildIndex, isClosed, type BacklogIndex } from "../model/graph";
import { parseId } from "../model/ids";
import type { CoreMessages } from "../messages";
import { DAY_MS, epicDoneClosure, isExpired, planEpicClosing } from "../model/lifecycle";
import { deletedEvent } from "../journal/events";
import type { Problem } from "../model/problems";
import type { Project, Task } from "../model/types";
import { FileBusyError, withAvailableLocks } from "./file-lock";
import { contentVersion, listDir, readTextOrNull, removeIfUnchanged, removeTemporariesBefore } from "./fs-utils";
import { appendJournal } from "./journal";
import { loadBacklog, type LoadedBacklog } from "./load";
import { reserveIssuedUpTo } from "./projects";
import { referenceCleanup } from "./references";
import { updateTaskInIndex, type TaskChanges } from "./update";
import type { UpdateTaskFailure } from "./write-result";

export type SweepReport = {
  closedEpics: string[];
  blockingFiles: string[];
  deleted: string[];
  conflicts: string[];
  invalid: { id: string; errors: string[] }[];
};

type SweepFailure = { id: string; reason: "conflict" } | { id: string; reason: "invalid"; errors: Problem[] };

type EpicStep = { closed: string[]; failures: SweepFailure[]; leftOpen: ReadonlySet<string>; blockingFiles: string[] };

type RemovalStep = { deleted: string[]; failures: SweepFailure[] };

type UpdateStep = { failures: SweepFailure[]; stillReferenced: ReadonlySet<string> };

export async function sweepClosed(root: string, now: Date, messages: CoreMessages): Promise<SweepReport> {
  const initial = await loadBacklog(root);
  const epics = await closeCompletedEpics(initial, now, messages);
  const { projects, tasks } = epics.closed.length > 0 ? await loadBacklog(root) : initial;

  const waitsForEpic = (task: Task) => task.epic !== undefined && epics.leftOpen.has(task.epic);
  const expired = tasks.filter((task) => isExpired(task, now) && !waitsForEpic(task));
  const reserved = await reserveNumbers(projects, expired);
  const removable = expired.filter((task) => reserved.has(task.projectId));
  const removal = await removeWithReferences(tasks, removable, now);
  await removeAbandonedTemporaries(root, now);
  return {
    closedEpics: epics.closed,
    blockingFiles: epics.blockingFiles,
    deleted: removal.deleted,
    ...failureLists([...epics.failures, ...removal.failures], messages),
  };
}

async function removeAbandonedTemporaries(root: string, now: Date): Promise<void> {
  const cutoff = new Date(now.getTime() - DAY_MS);
  const projectDirs = (await listDir(root)).filter((entry) => entry.isDirectory()).map((entry) => join(root, entry.name));
  for (const dir of [root, ...projectDirs]) await removeTemporariesBefore(dir, cutoff);
}

async function removeWithReferences(tasks: readonly Task[], removable: readonly Task[], now: Date): Promise<RemovalStep> {
  const conflict = (task: Task): SweepFailure => ({ id: task.id, reason: "conflict" });
  return withAvailableLocks(
    removable.map((task) => task.path),
    async (lockedPaths) => {
      const locked = removable.filter((task) => lockedPaths.has(task.path));
      const unchanged = await unchangedOnDisk(locked);
      const updates = await repairRemainingTasks(tasks, { skipped: removable, removed: unchanged }, now);
      const removal = await removeLocked(unchanged.filter((task) => !updates.stillReferenced.has(task.id)), now);
      const untouched = removable.filter((task) => !unchanged.includes(task)).map(conflict);
      return { deleted: removal.deleted, failures: [...updates.failures, ...untouched, ...removal.failures] };
    },
  );
}

async function unchangedOnDisk(tasks: readonly Task[]): Promise<Task[]> {
  const checked = await Promise.all(
    tasks.map(async (task) => {
      const text = await readTextOrNull(task.path);
      return text === null || contentVersion(text) === task.version;
    }),
  );
  return tasks.filter((_, position) => checked[position]);
}

async function closeCompletedEpics(loaded: LoadedBacklog, now: Date, messages: CoreMessages): Promise<EpicStep> {
  const plan = planEpicClosing(loaded.tasks, loaded.errors);
  const index = buildIndex(loaded.tasks);
  const closed: string[] = [];
  const failures: SweepFailure[] = [];
  for (const { epic, childIds } of plan.close) {
    const closure = epicDoneClosure(childIds, messages);
    const result = await updateTaskInIndex(index, { id: epic.id, changes: { status: "done" }, expectedVersion: epic.version, now, closure, via: "sweep" });
    if (result.ok) closed.push(epic.id);
    else failures.push(sweepFailure(epic.id, result));
  }
  const leftOpen = new Set([...plan.waiting.map(({ epic }) => epic.id), ...failures.map(({ id }) => id)]);
  const waitingProjects = new Set(plan.waiting.map(({ epic }) => epic.projectId));
  const blockingFiles = loaded.errors.filter((error) => waitingProjects.has(error.projectId)).map((error) => error.path);
  return { closed, failures, leftOpen, blockingFiles };
}

type Removal = { skipped: readonly Task[]; removed: readonly Task[] };

async function repairRemainingTasks(tasks: readonly Task[], { skipped, removed }: Removal, now: Date): Promise<UpdateStep> {
  const index = buildIndex(tasks);
  const skippedIds = new Set(skipped.map((task) => task.id));
  const removedIds = new Set(removed.map((task) => task.id));
  const failures: SweepFailure[] = [];
  const stillReferenced = new Set<string>();
  for (const task of tasks.filter((candidate) => !skippedIds.has(candidate.id))) {
    const cleanup = referenceCleanup(task, (id) => removedIds.has(id));
    if (cleanup === null && !lacksClosedDate(task)) continue;
    const failure = await repairFailure(index, task, cleanup ?? {}, now);
    if (failure === null) continue;
    failures.push(failure);
    for (const id of referencedIds(task)) if (removedIds.has(id)) stillReferenced.add(id);
  }
  return { failures, stillReferenced };
}

async function repairFailure(index: BacklogIndex, task: Task, changes: TaskChanges, now: Date): Promise<SweepFailure | null> {
  try {
    const result = await updateTaskInIndex(index, { id: task.id, changes, expectedVersion: task.version, now, via: "sweep" });
    return result.ok ? null : sweepFailure(task.id, result);
  } catch (error) {
    if (error instanceof FileBusyError) return { id: task.id, reason: "conflict" };
    throw error;
  }
}

function referencedIds(task: Task): string[] {
  return [...(task.epic === undefined ? [] : [task.epic]), ...task.blockedBy, ...task.related];
}

async function removeLocked(expired: readonly Task[], now: Date): Promise<RemovalStep> {
  const deleted: string[] = [];
  const failures: SweepFailure[] = [];
  for (const task of expired) {
    if (await removeIfUnchanged(task.path, task.version)) {
      deleted.push(task.id);
      await appendJournal(dirname(task.path), [deletedEvent(task, now, "sweep")]);
    } else failures.push({ id: task.id, reason: "conflict" });
  }
  return { deleted, failures };
}

function sweepFailure(id: string, failure: UpdateTaskFailure): SweepFailure {
  switch (failure.reason) {
    case "invalid":
      return { id, reason: "invalid", errors: failure.errors };
    case "conflict":
    case "not-found":
      return { id, reason: "conflict" };
  }
}

function failureLists(failures: readonly SweepFailure[], messages: CoreMessages): Pick<SweepReport, "conflicts" | "invalid"> {
  const firstPerTask = failures.filter((failure, position) => failures.findIndex(({ id }) => id === failure.id) === position);
  return {
    conflicts: firstPerTask.filter((failure) => failure.reason === "conflict").map(({ id }) => id),
    invalid: firstPerTask.flatMap((failure) => (failure.reason === "invalid" ? [{ id: failure.id, errors: failure.errors.map(messages.problem) }] : [])),
  };
}

function lacksClosedDate(task: Task): boolean {
  return isClosed(task.status) && task.closed === undefined;
}

async function reserveNumbers(projects: readonly Project[], expired: readonly Task[]): Promise<Set<string>> {
  const reserved = new Set<string>();
  for (const project of projects) {
    const numbers = expired.filter((task) => task.projectId === project.id).flatMap((task) => parseId(task.id)?.number ?? []);
    if (numbers.length === 0 || (await reserveIssuedUpTo(project, Math.max(...numbers)))) reserved.add(project.id);
  }
  return reserved;
}
