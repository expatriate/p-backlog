import type { ChangeSource, JournalEvent, ProjectJournal, TaskSnapshot } from "../journal/events";
import { isClosed } from "../model/graph";
import type { Resolution, Task, TaskStatus, TaskType } from "../model/types";

export type Transition = { at: number; from?: TaskStatus; to: TaskStatus; resolution?: Resolution; via: ChangeSource | "unknown" };

export type TaskHistory = { id: string; projectId: string; type: TaskType; createdAt: number; source?: string; transitions: Transition[] };

type Known = { projectId: string; final?: Task | TaskSnapshot; created?: Extract<JournalEvent, { kind: "created" }>; transitions: Transition[] };

export function taskHistories(tasks: readonly Task[], journals: readonly ProjectJournal[]): TaskHistory[] {
  const known = new Map<string, Known>();
  const entry = (id: string, projectId: string): Known => {
    const existing = known.get(id);
    if (existing) return existing;
    const created: Known = { projectId, transitions: [] };
    known.set(id, created);
    return created;
  };
  for (const task of tasks) entry(task.id, task.projectId).final = task;
  for (const { projectId, events } of journals) {
    for (const event of events) {
      const item = entry(event.task, projectId);
      if (event.kind === "created") item.created = event;
      if (event.kind === "deleted") item.final ??= event.snapshot;
      if (event.kind === "status") {
        item.transitions.push({ at: Date.parse(event.at), from: event.from, to: event.to, resolution: event.resolution, via: event.via });
      }
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

export function closingsOf(history: TaskHistory): Transition[] {
  return history.transitions.filter((transition) => isClosed(transition.to) && (transition.from === undefined || !isClosed(transition.from)));
}

export function reopeningsOf(history: TaskHistory): Transition[] {
  return history.transitions.filter((transition) => transition.from !== undefined && isClosed(transition.from) && !isClosed(transition.to));
}

function historyOf(id: string, { projectId, final, created, transitions }: Known): TaskHistory[] {
  const createdIso = final?.created ?? created?.at;
  const type = final?.type ?? created?.type;
  if (createdIso === undefined || type === undefined) return [];
  const ordered = [...transitions].sort((a, b) => a.at - b.at);
  return [{ id, projectId, type, createdAt: Date.parse(createdIso), source: final?.source ?? created?.source, transitions: [...ordered, ...restoredClosing(final, ordered)] }];
}

function restoredClosing(final: Task | TaskSnapshot | undefined, ordered: readonly Transition[]): Transition[] {
  if (final === undefined || !isClosed(final.status) || final.closed === undefined) return [];
  const last = ordered.at(-1);
  if (last !== undefined && isClosed(last.to)) return [];
  return [{ at: Date.parse(final.closed), to: final.status, resolution: final.resolution, via: "unknown" }];
}
