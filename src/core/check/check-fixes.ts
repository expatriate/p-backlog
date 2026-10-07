import type { CoreMessages } from "../messages";
import { buildIndex, type BacklogIndex } from "../model/graph";
import { parseId } from "../model/ids";
import { epicDoneClosure, planEpicClosing, planEpicReopening, type Closure } from "../model/lifecycle";
import type { Task, TaskStatus } from "../model/types";
import { unparsedTasks, type LoadedBacklog } from "../store/load";
import { referenceCleanup } from "../store/references";
import { statusToReopen, updateTaskInIndex, type TaskChanges } from "../store/update";
import type { UpdateTaskFailure } from "../store/write-result";
import type { AnchorPlan } from "./candidates";
import type { CheckFix, CheckProblem } from "./findings";

type FixTexts = Pick<CoreMessages, "epicDoneReason">;

export type FixOutcome = { fixed: CheckFix[]; failed: CheckProblem[] };

type Fix = { changes: TaskChanges; closure?: Closure | undefined; done: CheckFix[] };
type PlannedFix = Fix & { task: Task };
type EpicStatusFix = { status: TaskStatus; closure?: Closure | undefined; done: CheckFix };

export async function applyFixes(loaded: LoadedBacklog, inScope: (projectId: string) => boolean, { now, messages }: { now: Date; messages: FixTexts }): Promise<FixOutcome> {
  const isGone = goneTaskCheck(loaded);
  const epicFixes = await epicStatusFixes(loaded, inScope, messages);
  const planned = loaded.tasks
    .filter((task) => inScope(task.projectId))
    .flatMap((task): PlannedFix[] => {
      const fix = planFix(task, isGone, epicFixes.get(task.id));
      return fix === null ? [] : [{ task, ...fix }];
    });
  return applyPlanned(buildIndex(loaded.tasks), planned, now);
}

export async function applyAnchorPlans(tasks: readonly Task[], plans: readonly AnchorPlan[], now: Date): Promise<FixOutcome> {
  const index = buildIndex(tasks);
  const planned = plans.flatMap((plan): PlannedFix[] => {
    const task = index.byId.get(plan.id);
    return task === undefined ? [] : [{ task, changes: plan.changes, done: plan.moved === undefined ? [] : [plan.moved] }];
  });
  return applyPlanned(index, planned, now);
}

async function applyPlanned(index: BacklogIndex, planned: readonly PlannedFix[], now: Date): Promise<FixOutcome> {
  const fixed: CheckFix[] = [];
  const failed: CheckProblem[] = [];
  for (const { task, changes, closure, done } of planned) {
    const result = await updateTaskInIndex(index, { id: task.id, changes, expectedVersion: task.version, now, closure, via: "check" });
    if (result.ok) fixed.push(...done);
    else failed.push(fixFailure(task.id, result));
  }
  return { fixed, failed };
}

function fixFailure(taskId: string, failure: UpdateTaskFailure): CheckProblem {
  switch (failure.reason) {
    case "invalid":
      return { kind: "fix-failed", taskId, cause: "invalid", problems: failure.problems };
    case "conflict":
      return { kind: "fix-failed", taskId, cause: "changed-during-check" };
    case "not-found":
      return { kind: "fix-failed", taskId, cause: "gone-during-check" };
    case "busy":
      return { kind: "fix-failed", taskId, cause: "busy-during-check" };
  }
}

async function epicStatusFixes(loaded: LoadedBacklog, inScope: (projectId: string) => boolean, messages: FixTexts): Promise<Map<string, EpicStatusFix>> {
  const closing = planEpicClosing(loaded.tasks, loaded.errors).close.map(({ epic, childIds }): [string, EpicStatusFix] => [
    epic.id,
    { status: "done", closure: epicDoneClosure(childIds, messages), done: { kind: "epic-closed", taskId: epic.id, childIds } },
  ]);
  const reopenable = planEpicReopening(loaded.tasks).filter(({ epic }) => inScope(epic.projectId));
  const reopening = await Promise.all(
    reopenable.map(async ({ epic, childIds }): Promise<[string, EpicStatusFix]> => [epic.id, { status: await statusToReopen(epic), done: { kind: "epic-reopened", taskId: epic.id, childIds } }]),
  );
  return new Map([...closing, ...reopening]);
}

function planFix(task: Task, isGone: (id: string) => boolean, epicFix: EpicStatusFix | undefined): Fix | null {
  const cleanup = referenceCleanup(task, isGone);
  if (cleanup === null && epicFix === undefined) return null;

  const done: CheckFix[] = [];
  if (cleanup !== null) done.push({ kind: "references-removed", taskId: task.id, ids: goneReferences(task, isGone) });
  if (epicFix === undefined) return { changes: cleanup ?? {}, done };
  return { changes: { ...cleanup, status: epicFix.status }, closure: epicFix.closure, done: [...done, epicFix.done] };
}

function goneReferences(task: Task, isGone: (id: string) => boolean): string[] {
  const references = [...task.blockedBy, ...task.related, ...(task.epic === undefined ? [] : [task.epic])];
  return [...new Set(references.filter(isGone))];
}

function goneTaskCheck(loaded: LoadedBacklog): (id: string) => boolean {
  const known = new Set([...loaded.tasks.map((task) => task.id), ...unparsedTasks(loaded.errors).map((task) => task.id)]);
  const loadedPrefixes = new Set(loaded.projects.map((project) => project.prefix));
  return (id) => {
    const prefix = parseId(id)?.prefix;
    return prefix !== undefined && loadedPrefixes.has(prefix) && !known.has(id);
  };
}
