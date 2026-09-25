import type { BatchAction, BatchPrevious, BatchRequest, BatchSkipReason } from "../api/contract";
import { isClosed, type BacklogIndex } from "../model/graph";
import { compareIds } from "../model/ids";
import type { Closure } from "../model/lifecycle";
import type { Problem } from "../model/problems";
import type { Task } from "../model/types";
import { FileBusyError } from "./file-lock";
import { updateTaskInIndex, type TaskChanges, type UpdateTaskRequest } from "./update";
import type { UpdateTaskResult } from "./write-result";

export type CoreBatchOutcome =
  | { id: string; outcome: "done"; task: Task; previous: BatchPrevious }
  | { id: string; outcome: "skipped"; reason: BatchSkipReason; problems?: Problem[] };

type Plan = { skip: BatchSkipReason } | { changes: TaskChanges; closure?: Closure | undefined };

export async function applyBatch(index: BacklogIndex, { tasks, action, now }: BatchRequest & { now: Date }): Promise<CoreBatchOutcome[]> {
  const ordered = [...tasks].sort((left, right) => compareIds(left.id, right.id));
  const outcomes: CoreBatchOutcome[] = [];
  for (const task of ordered) outcomes.push(await applyOne(index, task, action, now));
  return outcomes;
}

async function applyOne(index: BacklogIndex, { id, version }: { id: string; version: string }, action: BatchAction, now: Date): Promise<CoreBatchOutcome> {
  const current = index.byId.get(id);
  if (!current) return { id, outcome: "skipped", reason: "not-found" };
  const plan = planFor(current, action);
  if ("skip" in plan) return { id, outcome: "skipped", reason: plan.skip };
  const result = await updateUnlessBusy(index, { id, changes: plan.changes, closure: plan.closure, expectedVersion: version, now, via: "web", undo: action.kind === "restore" });
  if (result === "busy") return { id, outcome: "skipped", reason: "busy" };
  if (result.ok) return { id, outcome: "done", task: result.task, previous: previousOf(current) };
  if (result.reason === "conflict") return { id, outcome: "skipped", reason: "changed" };
  if (result.reason === "not-found") return { id, outcome: "skipped", reason: "not-found" };
  return { id, outcome: "skipped", reason: "invalid", problems: result.errors };
}

async function updateUnlessBusy(index: BacklogIndex, request: UpdateTaskRequest): Promise<UpdateTaskResult | "busy"> {
  try {
    return await updateTaskInIndex(index, request);
  } catch (error) {
    if (error instanceof FileBusyError) return "busy";
    throw error;
  }
}

function planFor(current: Task, action: BatchAction): Plan {
  switch (action.kind) {
    case "close":
      return isClosed(current.status) ? { skip: "already-closed" } : { changes: { status: "cancelled" }, closure: { resolution: "obsolete", reason: action.reason } };
    case "priority":
      return { changes: { priority: action.priority } };
    case "epic":
      return epicPlan(current, action.epic);
    case "restore":
      return restorePlan(current, action.changes[current.id]);
  }
}

function epicPlan(current: Task, epic: string | null): Plan {
  return current.type === "epic" ? { skip: "invalid" } : { changes: { epic } };
}

function restorePlan(current: Task, previous: BatchPrevious | undefined): Plan {
  if (!previous) return { skip: "invalid" };
  const wouldClose = previous.status !== current.status && isClosed(previous.status);
  if (wouldClose) return { skip: "invalid" };
  return { changes: { status: previous.status, priority: previous.priority, epic: previous.epic } };
}

function previousOf(task: Task): BatchPrevious {
  return { status: task.status, priority: task.priority, epic: task.epic ?? null, resolution: task.resolution ?? null, reason: task.reason ?? null };
}
