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

function unknownAsMissing<const T extends readonly [string, ...string[]]>(values: T) {
  return z.enum(values).optional().catch(undefined);
}

export const FOUND_HOW = ["review", "incidental", "manual"] as const;

export type FoundHow = (typeof FOUND_HOW)[number];

export type TaskOrigin = { branch?: string | undefined; commit: string };

export type Provenance = { found?: FoundHow | undefined; foundExplicit?: true | undefined; origin?: TaskOrigin | undefined };

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

type MethodMarks = { method?: CheckMethod | undefined; bySymbol?: boolean | undefined; byAnchor?: boolean | undefined };

function checkMethodOf({ bySymbol, byAnchor }: Omit<MethodMarks, "method">): CheckMethod {
  if (bySymbol === true) return "symbol";
  return byAnchor === true ? "anchor" : "file";
}

export function recordedMethodOf({ method, bySymbol, byAnchor }: MethodMarks): RecordedMethod {
  if (method !== undefined) return method;
  return bySymbol === true || byAnchor === true ? checkMethodOf({ bySymbol, byAnchor }) : "unknown";
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
    foundExplicit: z.literal(true).optional().catch(undefined),
    origin: z.object({ branch: z.string().optional(), commit: z.string().min(1) }).optional(),
  }),
  z.object({ ...eventBase, kind: z.literal("status"), from: z.enum(TASK_STATUSES), to: z.enum(TASK_STATUSES), resolution: recordedEnum(RESOLUTIONS).optional() }),
  z.object({ ...eventBase, kind: z.literal("priority"), from: recordedEnum(PRIORITIES), to: recordedEnum(PRIORITIES) }),
  z.object({ ...eventBase, kind: z.literal("deleted"), snapshot: taskSnapshotSchema }),
  z.object({ ...eventBase, kind: z.literal("category"), from: recordedEnum(TASK_CATEGORIES).optional(), to: recordedEnum(TASK_CATEGORIES).optional() }),
  z.object({ ...eventBase, kind: z.literal("verified"), source: z.string().optional() }),
  z.object({ ...eventBase, kind: z.literal("candidate"), evidence: z.enum(CANDIDATE_EVIDENCE), mode: recordedEnum(CHECK_MODES),
    method: unknownAsMissing(CHECK_METHODS),
    bySymbol: z.boolean().optional(),
    byAnchor: z.boolean().optional(),
    match: unknownAsMissing(DUPLICATE_MATCHES),
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
      return event.mode === UNKNOWN;
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
    foundExplicit: provenance.foundExplicit,
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

type EpisodeState = "open" | "ended";

export function candidateEvents(sightings: readonly CandidateSighting[], states: EpisodeStates, now: Date, mode: CheckMode): JournalEvent[] {
  const at = formatLocalIso(now);
  return dedupeSightings(sightings)
    .filter((sighting) => states.get(episodeKey(sighting.task, sighting.evidence)) !== "open")
    .map((sighting) => ({
      at,
      task: sighting.task,
      via: "check",
      kind: "candidate",
      evidence: sighting.evidence,
      mode,
      ...(sighting.method === undefined ? {} : { method: sighting.method }),
      ...(sighting.match === undefined ? {} : { match: sighting.match }),
    }));
}

export function filteredEvents(filtered: readonly FilteredSighting[], states: EpisodeStates, now: Date): JournalEvent[] {
  const at = formatLocalIso(now);
  const byKey = new Map(filtered.map((sighting) => [filteredKey(sighting.task, sighting.symbol), sighting]));
  return [...byKey.entries()]
    .filter(([key]) => states.get(key) !== "open")
    .map(([, { task, symbol }]) => ({ at, task, via: "check", kind: "candidate-filtered", symbol }));
}

export function candidateGoneEvents(
  sightings: readonly CandidateSighting[],
  tasks: readonly string[],
  states: EpisodeStates,
  now: Date,
  checked: readonly CandidateEvidence[] = CANDIDATE_EVIDENCE,
): JournalEvent[] {
  const at = formatLocalIso(now);
  const seen = new Set(sightings.map((sighting) => episodeKey(sighting.task, sighting.evidence)));
  return tasks.flatMap((task) =>
    checked.flatMap((evidence): JournalEvent[] => {
      const key = episodeKey(task, evidence);
      return seen.has(key) || states.get(key) !== "open" ? [] : [{ at, task, via: "check", kind: "candidate-gone", evidence }];
    }),
  );
}

export type EpisodeStates = ReadonlyMap<string, EpisodeState>;

export function episodeStates(journal: readonly JournalEvent[]): EpisodeStates {
  const states = new Map<string, EpisodeState>();
  const filteredKeysByTask = new Map<string, Set<string>>();
  const beforeClosing = new Map<string, Array<[string, EpisodeState | undefined]>>();
  for (const event of journal) {
    if (event.kind === "candidate") {
      openEpisode(episodeKey(event.task, event.evidence), states);
      if (event.evidence === "source-changed") endEpisodes(filteredKeysByTask.get(event.task) ?? [], states);
    } else if (event.kind === "candidate-gone") {
      endEpisodes([episodeKey(event.task, event.evidence)], states);
    } else if (event.kind === "candidate-filtered") {
      const key = filteredKey(event.task, event.symbol);
      filteredKeysByTask.set(event.task, (filteredKeysByTask.get(event.task) ?? new Set()).add(key));
      openEpisode(key, states);
    } else if (undoesClosing(event)) {
      restoreEpisodes(beforeClosing.get(event.task) ?? [], states);
    } else if (endsEpisodes(event)) {
      const keys = [...CANDIDATE_EVIDENCE.map((evidence) => episodeKey(event.task, evidence)), ...(filteredKeysByTask.get(event.task) ?? [])];
      if (event.kind === "status") beforeClosing.set(event.task, keys.map((key) => [key, states.get(key)]));
      endEpisodes(keys, states);
    }
  }
  return states;
}

function openEpisode(key: string, states: Map<string, EpisodeState>): void {
  states.set(key, "open");
}

function endEpisodes(keys: Iterable<string>, states: Map<string, EpisodeState>): void {
  for (const key of keys) states.set(key, "ended");
}

function restoreEpisodes(entries: ReadonlyArray<[string, EpisodeState | undefined]>, states: Map<string, EpisodeState>): void {
  for (const [key, state] of entries) {
    if (state === undefined) states.delete(key);
    else states.set(key, state);
  }
}

export function episodeOpeners(journal: readonly JournalEvent[]): ReadonlySet<JournalEvent> {
  const states = episodeStates(journal);
  const seenKeys = new Set<string>();
  const openers = new Set<JournalEvent>();
  for (const event of journal.toReversed()) {
    const key = openingKey(event);
    if (key === null || seenKeys.has(key)) continue;
    seenKeys.add(key);
    if (states.get(key) === "open") openers.add(event);
  }
  return openers;
}

function openingKey(event: JournalEvent): string | null {
  if (event.kind === "candidate") return episodeKey(event.task, event.evidence);
  return event.kind === "candidate-filtered" ? filteredKey(event.task, event.symbol) : null;
}

function undoesClosing(event: JournalEvent): boolean {
  return event.kind === "status" && event.undo === true && isClosed(event.from) && !isClosed(event.to);
}

function endsEpisodes(event: JournalEvent): boolean {
  if (event.kind === "verified" || event.kind === "deleted") return true;
  return event.kind === "status" && isClosed(event.to);
}

function episodeKey(task: string, evidence: CandidateEvidence): string {
  return `${task}:${evidence}`;
}

function filteredKey(task: string, symbol: string): string {
  return `filtered:${task}:${symbol}`;
}

function dedupeSightings(sightings: readonly CandidateSighting[]): CandidateSighting[] {
  const byKey = new Map(sightings.map((sighting) => [episodeKey(sighting.task, sighting.evidence), sighting]));
  return [...byKey.values()];
}
