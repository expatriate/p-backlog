import { z } from "zod";
import { formatLocalIso } from "../model/dates";
import { isClosed } from "../model/graph";
import { PRIORITIES, RESOLUTIONS, TASK_CATEGORIES, TASK_STATUSES, TASK_TYPES, taskFrontmatterSchema, type Task } from "../model/types";

export const CHANGE_SOURCES = ["cli", "web", "check", "sweep"] as const;

export type ChangeSource = (typeof CHANGE_SOURCES)[number];

export const FOUND_HOW = ["review", "incidental"] as const;

export type FoundHow = (typeof FOUND_HOW)[number];

export type TaskOrigin = { branch?: string; commit: string };

export type Provenance = { found?: FoundHow; origin?: TaskOrigin };

export const CANDIDATE_EVIDENCE = ["source-missing", "source-changed", "duplicate", "no-source"] as const;

export type CandidateEvidence = (typeof CANDIDATE_EVIDENCE)[number];

export const CHECK_MODES = ["full", "changed"] as const;

export type CheckMode = (typeof CHECK_MODES)[number];

export type CandidateSighting = { task: string; evidence: CandidateEvidence };

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
    category: z.enum(TASK_CATEGORIES).optional(),
    found: z.enum(FOUND_HOW).optional(),
    origin: z.object({ branch: z.string().optional(), commit: z.string().min(1) }).optional(),
  }),
  z.object({ ...eventBase, kind: z.literal("status"), from: z.enum(TASK_STATUSES), to: z.enum(TASK_STATUSES), resolution: z.enum(RESOLUTIONS).optional() }),
  z.object({ ...eventBase, kind: z.literal("priority"), from: z.enum(PRIORITIES), to: z.enum(PRIORITIES) }),
  z.object({ ...eventBase, kind: z.literal("deleted"), snapshot: taskFrontmatterSchema }),
  z.object({ ...eventBase, kind: z.literal("category"), from: z.enum(TASK_CATEGORIES).optional(), to: z.enum(TASK_CATEGORIES).optional() }),
  z.object({ ...eventBase, kind: z.literal("verified"), source: z.string().optional() }),
  z.object({ ...eventBase, kind: z.literal("candidate"), evidence: z.enum(CANDIDATE_EVIDENCE), mode: z.enum(CHECK_MODES) }),
]);

export type JournalEvent = z.output<typeof journalEventSchema>;

export type TaskSnapshot = z.output<typeof taskFrontmatterSchema>;

const SNAPSHOT_FIELDS = Object.keys(taskFrontmatterSchema.shape) as (keyof TaskSnapshot)[];

export type ProjectJournal = { projectId: string; events: JournalEvent[]; invalidLines: number };

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

export function deletedEvent(task: Task, now: Date, via: ChangeSource): JournalEvent {
  return { at: formatLocalIso(now), task: task.id, via, kind: "deleted", snapshot: snapshotOf(task) };
}

function snapshotOf(task: Task): TaskSnapshot {
  return Object.fromEntries(SNAPSHOT_FIELDS.map((field) => [field, task[field]])) as TaskSnapshot;
}

export function candidateEvents(sightings: readonly CandidateSighting[], journal: readonly JournalEvent[], now: Date, mode: CheckMode): JournalEvent[] {
  const at = formatLocalIso(now);
  return sightings
    .filter((sighting) => isNewCandidate(sighting, journal))
    .map((sighting) => ({ at, task: sighting.task, via: "check", kind: "candidate", evidence: sighting.evidence, mode }));
}

function isNewCandidate({ task, evidence }: CandidateSighting, journal: readonly JournalEvent[]): boolean {
  const last = journal.filter((event) => event.task === task && endsOrRepeatsEpisode(event, evidence)).at(-1);
  return !(last?.kind === "candidate" && last.evidence === evidence);
}

function endsOrRepeatsEpisode(event: JournalEvent, evidence: CandidateEvidence): boolean {
  switch (event.kind) {
    case "candidate":
      return event.evidence === evidence;
    case "verified":
    case "deleted":
      return true;
    case "status":
      return isClosed(event.to);
    default:
      return false;
  }
}
