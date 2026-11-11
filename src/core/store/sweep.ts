import { dirname, join } from "node:path";
import type { PathErrorHandler } from "../errors";
import { isClosed, type BacklogIndex } from "../model/graph";
import { parseId } from "../model/ids";
import type { StoreMessages } from "../messages/store-messages";
import { epicDoneClosure, isExpired, planEpicClosing, planEpicReopening } from "../model/lifecycle";
import { deletedEvent } from "../journal/events";
import type { Problem } from "../model/problems";
import type { Project, Task } from "../model/types";
import { runAndStamp, runWhenDue } from "./daily";
import { withAvailableLocks } from "./file-lock";
import { contentVersion, readTextOrNull, removeIfUnchanged } from "./fs-utils";
import { removeTemporariesBefore } from "./atomic-write";
import { appendingJournal, bufferedJournal, type JournalWriter } from "./journal";
import { indexOfLoaded, loadBacklog, projectDirNames, type LoadedBacklog } from "./load";
import { reserveIssuedUpTo } from "./projects";
import { referenceCleanup } from "./references";
import { statusToReopen, updateTaskInIndex, type TaskChanges, type WriteOrigin } from "./update";
import type { WriteContext } from "./write-context";
import type { UpdateTaskFailure } from "./write-result";
import { DAY_MS } from "../model/dates";

export type SweepReport = {
  closedEpics: string[];
  reopenedEpics: string[];
  blockingFiles: string[];
  deleted: string[];
  conflicts: string[];
  invalid: { id: string; errors: string[] }[];
};

type SweepFailure = { id: string; reason: "conflict" } | { id: string; reason: "invalid"; problems: Problem[] };

type EpicStep = { closed: string[]; failures: SweepFailure[]; blockingFiles: string[] };

type ReopenStep = { reopened: string[]; failures: SweepFailure[] };

type RemovalStep = { deleted: string[]; failures: SweepFailure[] };

type UpdateStep = { failures: SweepFailure[]; stillReferenced: ReadonlySet<string> };

type SweepWrites = WriteContext & Pick<WriteOrigin, "journal">;

export const SWEPT_AT_FILE = ".swept-at";

export function sweepClosedWhenDue(root: string, writes: SweepWrites, messages: StoreMessages): Promise<SweepReport | null> {
  return runWhenDue(join(root, SWEPT_AT_FILE), writes, () => sweepClosed(root, writes, messages));
}

export function sweepClosedAndStamp(root: string, writes: SweepWrites, messages: StoreMessages): Promise<SweepReport> {
  return runAndStamp(join(root, SWEPT_AT_FILE), { now: writes.now, onErrorAfterPublish: writes.onError }, () => sweepClosed(root, writes, messages));
}

export async function sweepClosed(root: string, writes: SweepWrites, messages: StoreMessages): Promise<SweepReport> {
  const { now } = writes;
  const initial = await loadBacklog(root);
  const reopening = await reopenEpicsWithOpenTasks(initial, writes);
  const epics = await closeCompletedEpics(initial, writes, messages);
  const current = epics.closed.length > 0 || reopening.reopened.length > 0 ? await loadBacklog(root) : initial;
  const { projects, tasks } = current;

  const index = indexOfLoaded(current);
  const stillHoldsOpenTasks = new Set(planEpicReopening(tasks).map(({ epic }) => epic.id));
  const expired = tasks.filter((task) => isExpired(task, now, index) && !stillHoldsOpenTasks.has(task.id));
  const reserved = await reserveNumbers(projects, expired, writes.onError);
  const removable = expired.filter((task) => reserved.has(task.projectId));
  const removal = await removeWithReferences({ tasks, index }, removable, writes);
  await removeAbandonedTemporaries(root, now);
  return {
    closedEpics: epics.closed,
    reopenedEpics: reopening.reopened,
    blockingFiles: epics.blockingFiles,
    deleted: removal.deleted,
    ...failureLists([...reopening.failures, ...epics.failures, ...removal.failures], messages),
  };
}

async function removeAbandonedTemporaries(root: string, now: Date): Promise<void> {
  const cutoff = new Date(now.getTime() - DAY_MS);
  const projectDirs = (await projectDirNames(root)).map((name) => join(root, name));
  for (const dir of [root, ...projectDirs]) await removeTemporariesBefore(dir, cutoff);
}

type IndexedTasks = { tasks: readonly Task[]; index: BacklogIndex };

async function removeWithReferences(remaining: IndexedTasks, removable: readonly Task[], writes: SweepWrites): Promise<RemovalStep> {
  const conflict = (task: Task): SweepFailure => ({ id: task.id, reason: "conflict" });
  const journal = bufferedJournal(writes.journal ?? appendingJournal(writes.onError));
  const lockedWrites = { ...writes, journal: journal.write };
  try {
    return await withAvailableLocks(
      removable.map((task) => task.path),
      async (lockedPaths) => {
        const locked = removable.filter((task) => lockedPaths.has(task.path));
        const unchanged = await unchangedOnDisk(locked);
        const updates = await repairRemainingTasks(remaining, { skipped: removable, removed: unchanged }, lockedWrites);
        const removal = await removeLocked(
          unchanged.filter((task) => !updates.stillReferenced.has(task.id)),
          lockedWrites,
        );
        const untouched = removable.filter((task) => !unchanged.includes(task)).map(conflict);
        return { deleted: removal.deleted, failures: [...updates.failures, ...untouched, ...removal.failures] };
      },
      { onErrorAfterPublish: writes.onError },
    );
  } finally {
    await journal.flush();
  }
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

async function reopenEpicsWithOpenTasks(loaded: LoadedBacklog, writes: SweepWrites): Promise<ReopenStep> {
  const index = indexOfLoaded(loaded);
  const reopened: string[] = [];
  const failures: SweepFailure[] = [];
  for (const { epic } of planEpicReopening(loaded.tasks)) {
    const failure = await repairFailure(index, epic, { status: await statusToReopen(epic) }, writes);
    if (failure === null) reopened.push(epic.id);
    else failures.push(failure);
  }
  return { reopened, failures };
}

async function closeCompletedEpics(loaded: LoadedBacklog, writes: SweepWrites, messages: StoreMessages): Promise<EpicStep> {
  const plan = planEpicClosing(loaded.tasks, loaded.errors);
  const index = indexOfLoaded(loaded);
  const closed: string[] = [];
  const failures: SweepFailure[] = [];
  for (const { epic, childIds } of plan.close) {
    const closure = epicDoneClosure(childIds, messages);
    const result = await updateTaskInIndex(index, { id: epic.id, changes: { status: "done" }, expectedVersion: epic.version, ...writes, closure, via: "sweep" });
    if (result.ok) closed.push(epic.id);
    else failures.push(sweepFailure(epic.id, result));
  }
  const waitingProjects = new Set(plan.waiting.map(({ epic }) => epic.projectId));
  const blockingFiles = loaded.errors.filter((error) => waitingProjects.has(error.projectId)).map((error) => error.path);
  return { closed, failures, blockingFiles };
}

type Removal = { skipped: readonly Task[]; removed: readonly Task[] };

async function repairRemainingTasks({ tasks, index }: IndexedTasks, { skipped, removed }: Removal, writes: SweepWrites): Promise<UpdateStep> {
  const skippedIds = new Set(skipped.map((task) => task.id));
  const removedIds = new Set(removed.map((task) => task.id));
  const failures: SweepFailure[] = [];
  const stillReferenced = new Set<string>();
  for (const task of tasks.filter((candidate) => !skippedIds.has(candidate.id))) {
    const cleanup = referenceCleanup(task, (id) => removedIds.has(id));
    if (cleanup === null && !lacksClosedDate(task)) continue;
    const failure = await repairFailure(index, task, cleanup ?? {}, writes);
    if (failure === null) continue;
    failures.push(failure);
    for (const id of referencedIds(task)) if (removedIds.has(id)) stillReferenced.add(id);
  }
  return { failures, stillReferenced };
}

async function repairFailure(index: BacklogIndex, task: Task, changes: TaskChanges, writes: SweepWrites): Promise<SweepFailure | null> {
  const result = await updateTaskInIndex(index, { id: task.id, changes, expectedVersion: task.version, ...writes, via: "sweep" });
  return result.ok ? null : sweepFailure(task.id, result);
}

function referencedIds(task: Task): string[] {
  return [...(task.epic === undefined ? [] : [task.epic]), ...task.blockedBy, ...task.related];
}

async function removeLocked(expired: readonly Task[], { now, journal }: { now: Date; journal: JournalWriter }): Promise<RemovalStep> {
  const deleted: string[] = [];
  const failures: SweepFailure[] = [];
  for (const task of expired) {
    const outcome = await removeIfUnchanged(task.path, task.version);
    if (outcome === "changed") failures.push({ id: task.id, reason: "conflict" });
    if (outcome !== "removed") continue;
    deleted.push(task.id);
    await journal(dirname(task.path), [deletedEvent(task, now, "sweep")]);
  }
  return { deleted, failures };
}

function sweepFailure(id: string, failure: UpdateTaskFailure): SweepFailure {
  switch (failure.reason) {
    case "invalid":
      return { id, reason: "invalid", problems: failure.problems };
    case "conflict":
    case "not-found":
    case "busy":
      return { id, reason: "conflict" };
  }
}

function failureLists(failures: readonly SweepFailure[], messages: StoreMessages): Pick<SweepReport, "conflicts" | "invalid"> {
  const firstPerTask = failures.filter((failure, position) => failures.findIndex(({ id }) => id === failure.id) === position);
  return {
    conflicts: firstPerTask.filter((failure) => failure.reason === "conflict").map(({ id }) => id),
    invalid: firstPerTask.flatMap((failure) => (failure.reason === "invalid" ? [{ id: failure.id, errors: failure.problems.map(messages.problem) }] : [])),
  };
}

function lacksClosedDate(task: Task): boolean {
  return isClosed(task.status) && task.closed === undefined;
}

async function reserveNumbers(projects: readonly Project[], expired: readonly Task[], onError: PathErrorHandler): Promise<Set<string>> {
  const reserved = new Set<string>();
  for (const project of projects) {
    const numbers = expired.filter((task) => task.projectId === project.id).flatMap((task) => parseId(task.id)?.number ?? []);
    if (numbers.length === 0 || (await reserveIssuedUpTo(project, Math.max(...numbers), onError)).ok) reserved.add(project.id);
  }
  return reserved;
}
