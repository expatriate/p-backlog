import { dirname } from "node:path";
import { buildIndex, isClosed } from "../model/graph";
import { parseId } from "../model/ids";
import { isExpired, planEpicClosing } from "../model/lifecycle";
import { deletedEvent } from "../journal/events";
import type { Project, Task } from "../model/types";
import { removeIfUnchanged } from "./fs-utils";
import { appendJournal } from "./journal";
import { loadBacklog, type LoadedBacklog } from "./load";
import { reserveIssuedUpTo } from "./projects";
import { referenceCleanup } from "./references";
import { updateTaskInIndex } from "./update";
import type { UpdateTaskFailure } from "./write-result";

export type SweepReport = {
  closedEpics: string[];
  blockingFiles: string[];
  deleted: string[];
  conflicts: string[];
  invalid: { id: string; errors: string[] }[];
};

type SweepFailure = { id: string; reason: "conflict" } | { id: string; reason: "invalid"; errors: string[] };

type EpicStep = { closed: string[]; failures: SweepFailure[]; leftOpen: ReadonlySet<string>; blockingFiles: string[] };

type RemovalStep = { deleted: string[]; failures: SweepFailure[] };

type UpdateStep = { failures: SweepFailure[]; stillReferenced: ReadonlySet<string> };

export async function sweepClosed(root: string, now: Date): Promise<SweepReport> {
  const initial = await loadBacklog(root);
  const epics = await closeCompletedEpics(initial, now);
  const { projects, tasks } = epics.closed.length > 0 ? await loadBacklog(root) : initial;

  const waitsForEpic = (task: Task) => task.epic !== undefined && epics.leftOpen.has(task.epic);
  const expired = tasks.filter((task) => isExpired(task, now) && !waitsForEpic(task));
  const reserved = await reserveNumbers(projects, expired);
  const removable = expired.filter((task) => reserved.has(task.projectId));
  const updates = await repairRemainingTasks(tasks, removable, now);
  const removal = await removeExpired(removable.filter((task) => !updates.stillReferenced.has(task.id)), now);
  return {
    closedEpics: epics.closed,
    blockingFiles: epics.blockingFiles,
    deleted: removal.deleted,
    ...failureLists([...epics.failures, ...updates.failures, ...removal.failures]),
  };
}

async function closeCompletedEpics(loaded: LoadedBacklog, now: Date): Promise<EpicStep> {
  const plan = planEpicClosing(loaded.tasks, loaded.errors);
  const index = buildIndex(loaded.tasks);
  const closed: string[] = [];
  const failures: SweepFailure[] = [];
  for (const { epic, closure } of plan.close) {
    const result = await updateTaskInIndex(index, { id: epic.id, changes: { status: "done" }, expectedVersion: epic.version, now, closure, via: "sweep" });
    if (result.ok) closed.push(epic.id);
    else failures.push(sweepFailure(epic.id, result));
  }
  const leftOpen = new Set([...plan.waiting.map(({ epic }) => epic.id), ...failures.map(({ id }) => id)]);
  const waitingProjects = new Set(plan.waiting.map(({ epic }) => epic.projectId));
  const blockingFiles = loaded.errors.filter((error) => waitingProjects.has(error.projectId)).map((error) => error.path);
  return { closed, failures, leftOpen, blockingFiles };
}

async function repairRemainingTasks(tasks: readonly Task[], expired: readonly Task[], now: Date): Promise<UpdateStep> {
  const index = buildIndex(tasks);
  const expiredIds = new Set(expired.map((task) => task.id));
  const failures: SweepFailure[] = [];
  const stillReferenced = new Set<string>();
  for (const task of tasks.filter((candidate) => !expiredIds.has(candidate.id))) {
    const cleanup = referenceCleanup(task, (id) => expiredIds.has(id));
    if (cleanup === null && !lacksClosedDate(task)) continue;
    const result = await updateTaskInIndex(index, { id: task.id, changes: cleanup ?? {}, expectedVersion: task.version, now, via: "sweep" });
    if (result.ok) continue;
    failures.push(sweepFailure(task.id, result));
    for (const id of referencedIds(task)) if (expiredIds.has(id)) stillReferenced.add(id);
  }
  return { failures, stillReferenced };
}

function referencedIds(task: Task): string[] {
  return [...(task.epic === undefined ? [] : [task.epic]), ...task.blockedBy, ...task.related];
}

async function removeExpired(expired: readonly Task[], now: Date): Promise<RemovalStep> {
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

function failureLists(failures: readonly SweepFailure[]): Pick<SweepReport, "conflicts" | "invalid"> {
  const firstPerTask = failures.filter((failure, position) => failures.findIndex(({ id }) => id === failure.id) === position);
  return {
    conflicts: firstPerTask.filter((failure) => failure.reason === "conflict").map(({ id }) => id),
    invalid: firstPerTask.flatMap((failure) => (failure.reason === "invalid" ? [{ id: failure.id, errors: failure.errors }] : [])),
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
