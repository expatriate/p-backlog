import type { BatchAction, BatchPrevious, BatchRequest, BatchSkipReason } from "../api/contract";
import { isClosed, type BacklogIndex } from "../model/graph";
import { compareIds } from "../model/ids";
import type { Closure } from "../model/lifecycle";
import type { Problem } from "../model/problems";
import type { Task } from "../model/types";
import { updateTaskInIndex, type TaskChanges } from "./update";

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
  const plan = planFor(current, action, index);
  if ("skip" in plan) return { id, outcome: "skipped", reason: plan.skip };
  const result = await updateTaskInIndex(index, { id, changes: plan.changes, closure: plan.closure, expectedVersion: version, now, via: "web" });
  if (result.ok) return { id, outcome: "done", task: result.task, previous: previousOf(current) };
  if (result.reason === "conflict") return { id, outcome: "skipped", reason: "changed" };
  if (result.reason === "not-found") return { id, outcome: "skipped", reason: "not-found" };
  return { id, outcome: "skipped", reason: "invalid", problems: result.errors };
}

function planFor(current: Task, action: BatchAction, index: BacklogIndex): Plan {
  switch (action.kind) {
    case "close":
      return isClosed(current.status) ? { skip: "already-closed" } : { changes: { status: "cancelled" }, closure: { resolution: "obsolete", reason: action.reason } };
    case "priority":
      return { changes: { priority: action.priority } };
    case "epic":
      return epicPlan(current, action.epic, index);
    case "restore":
      return restorePlan(action.changes[current.id]);
  }
}

function epicPlan(current: Task, epic: string | null, index: BacklogIndex): Plan {
  if (current.type === "epic") return { skip: "invalid" };
  if (epic === null) return { changes: { epic: null } };
  const target = index.byId.get(epic);
  if (!target || target.type !== "epic" || target.projectId !== current.projectId) return { skip: "invalid" };
  return { changes: { epic } };
}

function restorePlan(previous: BatchPrevious | undefined): Plan {
  if (!previous) return { skip: "invalid" };
  const changes: TaskChanges = { status: previous.status, priority: previous.priority, epic: previous.epic };
  const closure: Closure | undefined = previous.resolution === null ? undefined : { resolution: previous.resolution, reason: previous.reason ?? "" };
  return { changes, closure };
}

function previousOf(task: Task): BatchPrevious {
  return { status: task.status, priority: task.priority, epic: task.epic ?? null, resolution: task.resolution ?? null, reason: task.reason ?? null };
}
