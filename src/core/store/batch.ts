import { isClosed, type BacklogIndex } from "../model/graph";
import { errorText, type PathErrorHandler } from "../errors";
import { compareIds } from "../model/ids";
import type { Closure } from "../model/lifecycle";
import type { Problem } from "../model/problems";
import type { Priority, Task, TaskStatus } from "../model/types";
import { appendingJournal, bufferedJournal, undoJournal, type JournalWriter } from "./journal";
import { updateTaskInIndex, type TaskChanges } from "./update";

export type BatchSkipReason = "changed" | "not-found" | "already-closed" | "invalid" | "busy" | "failed";

type SkipReason = Exclude<BatchSkipReason, "failed">;

type BatchPrevious = { status: TaskStatus; priority: Priority; epic: string | null };

type BatchAction = { kind: "close"; reason: string } | { kind: "priority"; priority: Priority } | { kind: "epic"; epic: string | null } | { kind: "restore"; changes: Readonly<Record<string, BatchPrevious>> };

type BatchRequest = { tasks: readonly { id: string; version: string }[]; action: BatchAction; now: Date; onError: PathErrorHandler };

export type CoreBatchOutcome =
  | { id: string; outcome: "done"; task: Task; reopenedEpic?: Task | undefined; previous: BatchPrevious }
  | { id: string; outcome: "skipped"; reason: SkipReason; problems?: Problem[] }
  | { id: string; outcome: "skipped"; reason: "failed"; detail: string };

type Plan = { skip: SkipReason } | { changes: TaskChanges; closure?: Closure | undefined };

export async function applyBatch(index: BacklogIndex, { tasks, action, now, onError }: BatchRequest): Promise<CoreBatchOutcome[]> {
  const ordered = [...tasks].sort((left, right) => compareIds(left.id, right.id));
  const journal = bufferedJournal(appendingJournal(onError));
  const write = action.kind === "restore" ? undoJournal(journal.write) : journal.write;
  const outcomes: CoreBatchOutcome[] = [];
  for (const task of ordered) outcomes.push(await applyOne(index, task, { action, now, onError, journal: write }).catch((error: unknown) => failed(task.id, error)));
  await journal.flush();
  return outcomes;
}

type BatchStep = { action: BatchAction; now: Date; onError: PathErrorHandler; journal: JournalWriter };

async function applyOne(index: BacklogIndex, { id, version }: { id: string; version: string }, { action, now, onError, journal }: BatchStep): Promise<CoreBatchOutcome> {
  const current = index.byId.get(id);
  if (!current) return { id, outcome: "skipped", reason: "not-found" };
  const plan = planFor(current, action);
  if ("skip" in plan) return { id, outcome: "skipped", reason: plan.skip };
  const result = await updateTaskInIndex(index, { id, changes: plan.changes, closure: plan.closure, expectedVersion: version, now, via: "web", onError, journal });
  if (result.ok) return { id, outcome: "done", task: result.task, reopenedEpic: result.reopenedEpic, previous: previousOf(current) };
  if (result.reason === "conflict") return { id, outcome: "skipped", reason: "changed" };
  if (result.reason === "not-found") return { id, outcome: "skipped", reason: "not-found" };
  if (result.reason === "busy") return { id, outcome: "skipped", reason: "busy" };
  return { id, outcome: "skipped", reason: "invalid", problems: result.problems };
}

function failed(id: string, error: unknown): CoreBatchOutcome {
  return { id, outcome: "skipped", reason: "failed", detail: errorText(error) };
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
  return { status: task.status, priority: task.priority, epic: task.epic ?? null };
}
