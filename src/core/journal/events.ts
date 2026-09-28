import { z } from "zod";
import { formatLocalIso } from "../model/dates";
import { isClosed } from "../model/graph";
import { PRIORITIES, RESOLUTIONS, TASK_CATEGORIES, TASK_STATUSES, TASK_TYPES, taskFrontmatterSchema, type Task, type TaskStatus } from "../model/types";

const CHANGE_SOURCES = ["cli", "web", "check", "sweep"] as const;

export type ChangeSource = (typeof CHANGE_SOURCES)[number];

export const UNKNOWN = "unknown";

export type Recorded<T extends string> = T | typeof UNKNOWN;

function recordedEnum<const T extends readonly [string, ...string[]]>(values: T) {
  return z.enum([...values, UNKNOWN]).catch(UNKNOWN);
}

export const FOUND_HOW = ["review", "incidental", "manual"] as const;

export type FoundHow = (typeof FOUND_HOW)[number];

export type TaskOrigin = { branch?: string | undefined; commit: string };

export type Provenance = { found?: FoundHow | undefined; origin?: TaskOrigin | undefined };

export const CANDIDATE_EVIDENCE = ["source-changed", "source-missing", "duplicate", "no-source"] as const;

export type CandidateEvidence = (typeof CANDIDATE_EVIDENCE)[number];

const CHECK_MODES = ["full", "changed"] as const;

export type CheckMode = (typeof CHECK_MODES)[number];

const CHECK_METHODS = ["symbol", "anchor", "file"] as const;

export type CheckMethod = (typeof CHECK_METHODS)[number];

export const RECORDED_METHODS = [...CHECK_METHODS, UNKNOWN] as const;

export type RecordedMethod = (typeof RECORDED_METHODS)[number];

const DUPLICATE_MATCHES = ["source", "title", "symbol"] as const;

export type DuplicateMatch = (typeof DUPLICATE_MATCHES)[number];

export const RECORDED_MATCHES = [...DUPLICATE_MATCHES, UNKNOWN] as const;

export type RecordedMatch = (typeof RECORDED_MATCHES)[number];

export type CandidateSighting = { task: string; evidence: CandidateEvidence; method?: CheckMethod; match?: DuplicateMatch };

export type FilteredSighting = { task: string; symbol: string };

type MethodMarks = { method?: RecordedMethod | undefined; bySymbol?: boolean | undefined; byAnchor?: boolean | undefined };

export function recordedMethodOf({ method, bySymbol, byAnchor }: MethodMarks): RecordedMethod {
  if (method !== undefined) return method;
  if (bySymbol === true) return "symbol";
  return byAnchor === true ? "anchor" : UNKNOWN;
}

const eventBase = { at: z.iso.datetime({ offset: true }), task: z.string().min(1), via: recordedEnum(CHANGE_SOURCES), undo: z.literal(true).optional().catch(undefined) };

const taskSnapshotSchema = taskFrontmatterSchema.extend({
  priority: recordedEnum(PRIORITIES),
  category: recordedEnum(TASK_CATEGORIES).optional(),
  resolution: recordedEnum(RESOLUTIONS).optional(),
});

export const journalEventSchema = z.discriminatedUnion("kind", [
  z.object({
    ...eventBase,
    kind: z.literal("created"),
    type: z.enum(TASK_TYPES),
    priority: recordedEnum(PRIORITIES),
    tags: z.array(z.string()),
    source: z.string().optional(),
    epic: z.string().optional(),
    category: recordedEnum(TASK_CATEGORIES).optional(),
    found: recordedEnum(FOUND_HOW).optional(),
    origin: z.object({ branch: z.string().optional(), commit: z.string().min(1) }).optional(),
  }),
  z.object({ ...eventBase, kind: z.literal("status"), from: z.enum(TASK_STATUSES), to: z.enum(TASK_STATUSES), resolution: recordedEnum(RESOLUTIONS).optional() }),
  z.object({ ...eventBase, kind: z.literal("priority"), from: recordedEnum(PRIORITIES), to: recordedEnum(PRIORITIES) }),
  z.object({ ...eventBase, kind: z.literal("deleted"), snapshot: taskSnapshotSchema }),
  z.object({ ...eventBase, kind: z.literal("category"), from: recordedEnum(TASK_CATEGORIES).optional(), to: recordedEnum(TASK_CATEGORIES).optional() }),
  z.object({ ...eventBase, kind: z.literal("verified"), source: z.string().optional() }),
  z.object({ ...eventBase, kind: z.literal("candidate"), evidence: z.enum(CANDIDATE_EVIDENCE), mode: recordedEnum(CHECK_MODES),
    method: recordedEnum(CHECK_METHODS).optional(),
    bySymbol: z.boolean().optional(),
    byAnchor: z.boolean().optional(),
    match: recordedEnum(DUPLICATE_MATCHES).optional(),
  }),
  z.object({ ...eventBase, kind: z.literal("candidate-gone"), evidence: z.enum(CANDIDATE_EVIDENCE) }),
  z.object({ ...eventBase, kind: z.literal("candidate-filtered"), symbol: z.string() }),
]);

export type JournalEvent = z.output<typeof journalEventSchema>;

export type TaskSnapshot = z.output<typeof taskSnapshotSchema>;

const SNAPSHOT_FIELDS = Object.keys(taskSnapshotSchema.shape) as (keyof TaskSnapshot)[];

export type ProjectJournal = { projectId: string; events: readonly JournalEvent[]; invalidLines: number };

export function hasUnknownValue(event: JournalEvent): boolean {
  if (event.via === UNKNOWN) return true;
  switch (event.kind) {
    case "created":
      return event.priority === UNKNOWN || event.category === UNKNOWN || event.found === UNKNOWN;
    case "status":
      return event.resolution === UNKNOWN;
    case "priority":
      return event.from === UNKNOWN || event.to === UNKNOWN;
    case "category":
      return event.from === UNKNOWN || event.to === UNKNOWN;
    case "deleted":
      return event.snapshot.priority === UNKNOWN || event.snapshot.category === UNKNOWN || event.snapshot.resolution === UNKNOWN;
    case "candidate":
      return event.mode === UNKNOWN || event.method === UNKNOWN || event.match === UNKNOWN;
    case "verified":
    case "candidate-gone":
    case "candidate-filtered":
      return false;
  }
}

export function createdEvent(task: Task, now: Date, via: ChangeSource, provenance: Provenance = {}): JournalEvent {
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
    category: task.category,
    found: provenance.found,
    origin: provenance.origin,
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
  if (before.category !== after.category) events.push({ at, task: after.id, via, kind: "category", from: before.category, to: after.category });
  if (before.verified !== after.verified) {
    events.push({ at, task: after.id, via, kind: "verified", source: before.source === after.source ? undefined : after.source });
  }
  return events;
}

export function statusBeforeAutoClose(journal: readonly JournalEvent[], epicId: string): TaskStatus {
  const autoClose = journal.findLast((event) => event.task === epicId && event.kind === "status" && event.resolution === "epic-done");
  return autoClose?.kind === "status" && !isClosed(autoClose.from) ? autoClose.from : "backlog";
}

export function deletedEvent(task: Task, now: Date, via: ChangeSource): JournalEvent {
  return { at: formatLocalIso(now), task: task.id, via, kind: "deleted", snapshot: snapshotOf(task) };
}

function snapshotOf(task: Task): TaskSnapshot {
  return Object.fromEntries(SNAPSHOT_FIELDS.map((field) => [field, task[field]])) as TaskSnapshot;
}
