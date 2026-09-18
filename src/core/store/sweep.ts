import { dirname } from "node:path";
import { isClosed } from "../model/graph";
import { parseId } from "../model/ids";
import { isExpired, planEpicClosing } from "../model/lifecycle";
import { deletedEvent } from "../journal/events";
import { serializeProject } from "../model/project-file";
import type { Project, Task } from "../model/types";
import { removeIfUnchanged, writeFileAtomic } from "./fs-utils";
import { appendJournal } from "./journal";
import { loadBacklog, type LoadedBacklog } from "./load";
import { referenceCleanup } from "./references";
import { updateTaskIn } from "./update";
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

export async function sweepClosed(root: string, now: Date): Promise<SweepReport> {
  const initial = await loadBacklog(root);
  const epics = await closeCompletedEpics(initial, now);
  const { projects, tasks } = epics.closed.length > 0 ? await loadBacklog(root) : initial;

  const waitsForEpic = (task: Task) => task.epic !== undefined && epics.leftOpen.has(task.epic);
  const expired = tasks.filter((task) => isExpired(task, now) && !waitsForEpic(task));
  await reserveNumbers(projects, expired);
  const updateFailures = await updateRemainingTasks(tasks, expired, now);
  const removal = await removeExpired(expired, now);
  return {
    closedEpics: epics.closed,
    blockingFiles: epics.blockingFiles,
    deleted: removal.deleted,
    ...failureLists([...epics.failures, ...updateFailures, ...removal.failures]),
  };
}

async function closeCompletedEpics(loaded: LoadedBacklog, now: Date): Promise<EpicStep> {
  const plan = planEpicClosing(loaded.tasks, loaded.errors);
  const closed: string[] = [];
  const failures: SweepFailure[] = [];
  for (const { epic, closure } of plan.close) {
    const result = await updateTaskIn(loaded.tasks, { id: epic.id, changes: { status: "done" }, expectedVersion: epic.version, now, closure, via: "sweep" });
    if (result.ok) closed.push(epic.id);
    else failures.push(sweepFailure(epic.id, result));
  }
  const leftOpen = new Set([...plan.waiting.map(({ epic }) => epic.id), ...failures.map(({ id }) => id)]);
  const blockingFiles = plan.waiting.length === 0 ? [] : loaded.errors.map((error) => error.path);
  return { closed, failures, leftOpen, blockingFiles };
}

async function updateRemainingTasks(tasks: readonly Task[], expired: readonly Task[], now: Date): Promise<SweepFailure[]> {
  const expiredIds = new Set(expired.map((task) => task.id));
  const failures: SweepFailure[] = [];
  for (const task of tasks.filter((candidate) => !expiredIds.has(candidate.id))) {
    const cleanup = referenceCleanup(task, (id) => expiredIds.has(id));
    if (cleanup === null && !lacksClosedDate(task)) continue;
    const result = await updateTaskIn(tasks, { id: task.id, changes: cleanup ?? {}, expectedVersion: task.version, now, via: "sweep" });
    if (!result.ok) failures.push(sweepFailure(task.id, result));
  }
  return failures;
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

async function reserveNumbers(projects: readonly Project[], expired: readonly Task[]): Promise<void> {
  for (const project of projects) {
    const numbers = expired.filter((task) => task.projectId === project.id).flatMap((task) => parseId(task.id)?.number ?? []);
    if (numbers.length === 0) continue;
    const issuedUpTo = Math.max(project.issuedUpTo ?? 0, ...numbers);
    if (issuedUpTo !== project.issuedUpTo) await writeFileAtomic(project.path, serializeProject({ ...project, issuedUpTo }));
  }
}
