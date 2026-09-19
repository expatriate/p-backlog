import type { CandidateEvidence, ChangeSource, FoundHow, JournalEvent, ProjectJournal, TaskSnapshot } from "../journal/events";
import { isClosed } from "../model/graph";
import type { Resolution, Task, TaskCategory, TaskStatus, TaskType } from "../model/types";

export type Transition = { at: number; from?: TaskStatus; to: TaskStatus; resolution?: Resolution; via: ChangeSource | "unknown" };

export type TaskHistory = {
  id: string;
  projectId: string;
  type: TaskType;
  createdAt: number;
  source?: string;
  reason?: string;
  finalStatus: TaskStatus;
  transitions: Transition[];
  category?: TaskCategory;
  found?: FoundHow;
  branch?: string;
  candidates: { at: number; evidence: CandidateEvidence }[];
  verifications: number[];
};

type Known = {
  projectId: string;
  final?: Task | TaskSnapshot;
  created?: Extract<JournalEvent, { kind: "created" }>;
  categoryEvents: { at: number; to?: TaskCategory }[];
  transitions: Transition[];
  candidates: { at: number; evidence: CandidateEvidence }[];
  verifications: number[];
};

export function taskHistories(tasks: readonly Task[], journals: readonly ProjectJournal[]): TaskHistory[] {
  const known = new Map<string, Known>();
  const entry = (id: string, projectId: string): Known => {
    const existing = known.get(id);
    if (existing) return existing;
    const created: Known = { projectId, categoryEvents: [], transitions: [], candidates: [], verifications: [] };
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
      if (event.kind === "status") {
        item.transitions.push({ at: Date.parse(event.at), from: event.from, to: event.to, resolution: event.resolution, via: event.via });
      }
      if (event.kind === "candidate") item.candidates.push({ at: Date.parse(event.at), evidence: event.evidence });
      if (event.kind === "verified") item.verifications.push(Date.parse(event.at));
    }
  }
  return [...known.entries()].flatMap(([id, item]) => historyOf(id, item));
}

export function isOpenAt(history: TaskHistory, moment: number): boolean {
  if (history.createdAt > moment) return false;
  const last = history.transitions.filter((transition) => transition.at <= moment).at(-1);
  if (last !== undefined) return !isClosed(last.to);
  const first = history.transitions[0];
  return first?.from === undefined || !isClosed(first.from);
}

export function isClosing(transition: Transition): boolean {
  return isClosed(transition.to) && (transition.from === undefined || !isClosed(transition.from));
}

export function closingsOf(history: TaskHistory): Transition[] {
  return history.transitions.filter(isClosing);
}

export function reopeningsOf(history: TaskHistory): Transition[] {
  return history.transitions.filter((transition) => transition.from !== undefined && isClosed(transition.from) && !isClosed(transition.to));
}

function historyOf(id: string, { projectId, final, created, categoryEvents, transitions, candidates, verifications }: Known): TaskHistory[] {
  const createdIso = final?.created ?? created?.at;
  const type = final?.type ?? created?.type;
  if (createdIso === undefined || type === undefined) return [];
  const ordered = [...transitions].sort((a, b) => a.at - b.at);
  return [
    {
      id,
      projectId,
      type,
      createdAt: Date.parse(createdIso),
      source: final?.source ?? created?.source,
      reason: final?.reason,
      finalStatus: final?.status ?? "cancelled",
      transitions: [...ordered, ...restoredTransitions(final, ordered, Date.parse(createdIso))],
      category: categoryOf(final, created, categoryEvents),
      found: created?.found,
      branch: created?.origin?.branch,
      candidates: [...candidates].sort((a, b) => a.at - b.at),
      verifications: [...verifications].sort((a, b) => a - b),
    },
  ];
}

function categoryOf(
  final: Task | TaskSnapshot | undefined,
  created: Extract<JournalEvent, { kind: "created" }> | undefined,
  categoryEvents: readonly { at: number; to?: TaskCategory }[],
): TaskCategory | undefined {
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

export function emptyHistory(): TaskHistory {
  return { id: "", projectId: "", type: "task", createdAt: 0, finalStatus: "backlog", transitions: [], candidates: [], verifications: [] };
}
