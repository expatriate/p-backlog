import { recordedMethodOf, type Recorded, type CandidateEvidence, type ChangeSource, type RecordedMatch, type RecordedMethod, type FoundHow, type JournalEvent, type ProjectJournal, type TaskSnapshot } from "../journal/events";
import { isClosed } from "../model/graph";
import type { Priority, Resolution, Task, TaskCategory, TaskStatus, TaskType } from "../model/types";

const CREATED_STATUS: TaskStatus = "backlog";

export type Transition = { at: number; from?: TaskStatus | undefined; to: TaskStatus; resolution?: Resolution | undefined; via: ChangeSource | "unknown" };

export type TaskHistory = {
  id: string;
  projectId: string;
  type: TaskType;
  createdAt: number;
  source?: string | undefined;
  reason?: string | undefined;
  finalStatus: TaskStatus;
  transitions: Transition[];
  priority?: Recorded<Priority> | undefined;
  category?: Recorded<TaskCategory> | undefined;
  found?: Recorded<FoundHow> | undefined;
  branch?: string | undefined;
  candidates: CandidateSeen[];
  verifications: number[];
  filtered: number[];
};

export type CandidateSeen = { at: number; evidence: CandidateEvidence; method: RecordedMethod; match: RecordedMatch };

type CategoryEvent = { at: number; to?: Recorded<TaskCategory> | undefined };

type PriorityEvent = { at: number; to: Recorded<Priority> };

type Known = {
  projectId: string;
  final?: Task | TaskSnapshot;
  created?: Extract<JournalEvent, { kind: "created" }>;
  categoryEvents: CategoryEvent[];
  priorityEvents: PriorityEvent[];
  transitions: Transition[];
  candidates: CandidateSeen[];
  verifications: number[];
  filtered: number[];
};

export function taskHistories(tasks: readonly Task[], journals: readonly ProjectJournal[], unparsedIds: ReadonlySet<string> = new Set()): TaskHistory[] {
  const known = new Map<string, Known>();
  const entry = (id: string, projectId: string): Known => {
    const existing = known.get(id);
    if (existing) return existing;
    const created: Known = { projectId, categoryEvents: [], priorityEvents: [], transitions: [], candidates: [], verifications: [], filtered: [] };
    known.set(id, created);
    return created;
  };
  for (const task of tasks) entry(task.id, task.projectId).final = task;
  for (const { projectId, events } of journals) {
    for (const event of events) {
      const item = entry(event.task, projectId);
      if (event.kind === "created") item.created = event;
      if (event.kind === "deleted") item.final ??= event.snapshot;
      if (event.kind === "category") item.categoryEvents.push({ at: Date.parse(event.at), to: event.to });
      if (event.kind === "priority") item.priorityEvents.push({ at: Date.parse(event.at), to: event.to });
      if (event.kind === "status") {
        item.transitions.push({ at: Date.parse(event.at), from: event.from, to: event.to, resolution: event.resolution, via: event.via });
      }
      if (event.kind === "candidate") item.candidates.push({ at: Date.parse(event.at), evidence: event.evidence, method: recordedMethodOf(event), match: event.match ?? "unknown" });
      if (event.kind === "candidate-filtered") item.filtered.push(Date.parse(event.at));
      if (event.kind === "verified") item.verifications.push(Date.parse(event.at));
    }
  }
  return [...known.entries()].flatMap(([id, item]) => historyOf(id, item, unparsedIds.has(id)));
}

export function isOpenAt(history: TaskHistory, moment: number): boolean {
  if (history.createdAt > moment) return false;
  const last = history.transitions.filter((transition) => transition.at <= moment).at(-1);
  if (last !== undefined) return !isClosed(last.to);
  const first = history.transitions[0];
  return first?.from === undefined || !isClosed(first.from);
}

function isClosing(transition: Transition): boolean {
  return isClosed(transition.to) && (transition.from === undefined || !isClosed(transition.from));
}

export function closingsOf(history: TaskHistory): Transition[] {
  return history.transitions.filter(isClosing);
}

export function isFixedNow(history: TaskHistory): boolean {
  return isClosed(history.finalStatus) && closingsOf(history).at(-1)?.resolution === "fixed";
}

export function reopeningsOf(history: TaskHistory): Transition[] {
  return history.transitions.filter((transition) => transition.from !== undefined && isClosed(transition.from) && !isClosed(transition.to));
}

function historyOf(id: string, { projectId, final, created, categoryEvents, priorityEvents, transitions, candidates, verifications, filtered }: Known, unparsed: boolean): TaskHistory[] {
  const createdIso = final?.created ?? created?.at;
  const type = final?.type ?? created?.type;
  if (createdIso === undefined || type === undefined) return [];
  const ordered = [...transitions].sort((a, b) => a.at - b.at);
  const fateUnknown = final === undefined && unparsed;
  return [
    {
      id,
      projectId,
      type,
      createdAt: Date.parse(createdIso),
      source: final?.source ?? created?.source,
      reason: final?.reason,
      finalStatus: final?.status ?? (fateUnknown ? (ordered.at(-1)?.to ?? CREATED_STATUS) : "cancelled"),
      transitions: fateUnknown ? ordered : [...ordered, ...restoredTransitions(final, ordered, Date.parse(createdIso))],
      priority: final?.priority ?? [...priorityEvents].sort((a, b) => a.at - b.at).at(-1)?.to ?? created?.priority,
      category: categoryOf(final, created, categoryEvents),
      found: created?.found,
      branch: created?.origin?.branch,
      candidates: [...candidates].sort((a, b) => a.at - b.at),
      verifications: [...verifications].sort((a, b) => a - b),
      filtered: [...filtered].sort((a, b) => a - b),
    },
  ];
}

function categoryOf(
  final: Task | TaskSnapshot | undefined,
  created: Extract<JournalEvent, { kind: "created" }> | undefined,
  categoryEvents: readonly CategoryEvent[],
): Recorded<TaskCategory> | undefined {
  if (final !== undefined) return final.category;
  const lastCategoryEvent = [...categoryEvents].sort((a, b) => a.at - b.at).at(-1);
  return lastCategoryEvent !== undefined ? lastCategoryEvent.to : created?.category;
}

function restoredTransitions(final: Task | TaskSnapshot | undefined, ordered: readonly Transition[], createdAt: number): Transition[] {
  const last = ordered.at(-1);
  const lastClosed = last !== undefined && isClosed(last.to);
  if (final === undefined) return lastClosed ? [] : [{ at: last?.at ?? createdAt, to: "cancelled", via: "unknown" }];
  if (isClosed(final.status)) {
    if (lastClosed) return [];
    const at = final.closed === undefined ? (last?.at ?? createdAt) : Date.parse(final.closed);
    return [{ at, to: final.status, resolution: final.resolution, via: "unknown" }];
  }
  if (!lastClosed || last === undefined) return [];
  return [{ at: last.at + 1, from: last.to, to: final.status, via: "unknown" }];
}
