import { z } from "zod";
import { formatLocalIso } from "../model/dates";
import { isClosed } from "../model/graph";
import { PRIORITIES, RESOLUTIONS, TASK_STATUSES, TASK_TYPES, taskFrontmatterSchema, type Task } from "../model/types";

export const CHANGE_SOURCES = ["cli", "web", "check", "sweep"] as const;

export type ChangeSource = (typeof CHANGE_SOURCES)[number];

const eventBase = { at: z.iso.datetime({ offset: true }), task: z.string().min(1), via: z.enum(CHANGE_SOURCES) };

export const journalEventSchema = z.discriminatedUnion("kind", [
  z.object({
    ...eventBase,
    kind: z.literal("created"),
    type: z.enum(TASK_TYPES),
    priority: z.enum(PRIORITIES),
    tags: z.array(z.string()),
    source: z.string().optional(),
    epic: z.string().optional(),
  }),
  z.object({ ...eventBase, kind: z.literal("status"), from: z.enum(TASK_STATUSES), to: z.enum(TASK_STATUSES), resolution: z.enum(RESOLUTIONS).optional() }),
  z.object({ ...eventBase, kind: z.literal("priority"), from: z.enum(PRIORITIES), to: z.enum(PRIORITIES) }),
  z.object({ ...eventBase, kind: z.literal("deleted"), snapshot: taskFrontmatterSchema }),
]);

export type JournalEvent = z.output<typeof journalEventSchema>;

export type TaskSnapshot = z.output<typeof taskFrontmatterSchema>;

export type ProjectJournal = { projectId: string; events: JournalEvent[]; invalidLines: number };

export function createdEvent(task: Task, now: Date, via: ChangeSource): JournalEvent {
  return {
    at: formatLocalIso(now),
    task: task.id,
    via,
    kind: "created",
    type: task.type,
    priority: task.priority,
    tags: task.tags,
    source: task.source,
    epic: task.epic,
  };
}

export function changeEvents(before: Task, after: Task, now: Date, via: ChangeSource): JournalEvent[] {
  const at = formatLocalIso(now);
  const events: JournalEvent[] = [];
  if (before.status !== after.status) {
    const resolution = isClosed(after.status) ? after.resolution : undefined;
    events.push({ at, task: after.id, via, kind: "status", from: before.status, to: after.status, resolution });
  }
  if (before.priority !== after.priority) events.push({ at, task: after.id, via, kind: "priority", from: before.priority, to: after.priority });
  return events;
}

export function deletedEvent(task: Task, now: Date, via: ChangeSource): JournalEvent {
  return { at: formatLocalIso(now), task: task.id, via, kind: "deleted", snapshot: snapshotOf(task) };
}

function snapshotOf(task: Task): TaskSnapshot {
  return {
    id: task.id,
    title: task.title,
    type: task.type,
    status: task.status,
    priority: task.priority,
    tags: task.tags,
    epic: task.epic,
    blockedBy: task.blockedBy,
    related: task.related,
    created: task.created,
    source: task.source,
    closed: task.closed,
    resolution: task.resolution,
    reason: task.reason,
    verified: task.verified,
  };
}
