import { formatLocalIso } from "../model/dates";
import { isClosed } from "../model/graph";
import { CANDIDATE_EVIDENCE, type CandidateEvidence, type CandidateSighting, type CheckMode, type FilteredSighting, type JournalEvent } from "./events";

type EpisodeState = "open" | "ended";

declare const episodeKeyBrand: unique symbol;

type EpisodeKey = string & { readonly [episodeKeyBrand]: true };

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
  return [...byKey.entries()].filter(([key]) => states.get(key) !== "open").map(([, { task, symbol }]) => ({ at, task, via: "check", kind: "candidate-filtered", symbol }));
}

type ReviewedTasks = { sightings: readonly CandidateSighting[]; reviewed: readonly string[]; checked?: readonly CandidateEvidence[] };

export function candidateGoneEvents({ sightings, reviewed, checked = CANDIDATE_EVIDENCE }: ReviewedTasks, states: EpisodeStates, now: Date): JournalEvent[] {
  const at = formatLocalIso(now);
  const seen = new Set(sightings.map((sighting) => episodeKey(sighting.task, sighting.evidence)));
  return reviewed.flatMap((task) =>
    checked.flatMap((evidence): JournalEvent[] => {
      const key = episodeKey(task, evidence);
      return seen.has(key) || states.get(key) !== "open" ? [] : [{ at, task, via: "check", kind: "candidate-gone", evidence }];
    }),
  );
}

export type EpisodeStates = ReadonlyMap<EpisodeKey, EpisodeState>;

type EpisodeBook = {
  states: Map<EpisodeKey, EpisodeState>;
  filteredKeysByTask: Map<string, Set<EpisodeKey>>;
  beforeClosing: Map<string, Array<[EpisodeKey, EpisodeState | undefined]>>;
};

export function episodeStates(journal: readonly JournalEvent[]): EpisodeStates {
  const book: EpisodeBook = { states: new Map(), filteredKeysByTask: new Map(), beforeClosing: new Map() };
  for (const event of journal) recordEpisodeEvent(book, event);
  return book.states;
}

function recordEpisodeEvent(book: EpisodeBook, event: JournalEvent): void {
  const { states, filteredKeysByTask, beforeClosing } = book;
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
    endTaskEpisodes(book, event);
  }
}

function endTaskEpisodes({ states, filteredKeysByTask, beforeClosing }: EpisodeBook, event: JournalEvent): void {
  const keys = [...CANDIDATE_EVIDENCE.map((evidence) => episodeKey(event.task, evidence)), ...(filteredKeysByTask.get(event.task) ?? [])];
  if (event.kind === "status")
    beforeClosing.set(
      event.task,
      keys.map((key) => [key, states.get(key)]),
    );
  endEpisodes(keys, states);
}

function openEpisode(key: EpisodeKey, states: Map<EpisodeKey, EpisodeState>): void {
  states.set(key, "open");
}

function endEpisodes(keys: Iterable<EpisodeKey>, states: Map<EpisodeKey, EpisodeState>): void {
  for (const key of keys) states.set(key, "ended");
}

function restoreEpisodes(entries: ReadonlyArray<[EpisodeKey, EpisodeState | undefined]>, states: Map<EpisodeKey, EpisodeState>): void {
  for (const [key, state] of entries) {
    if (state === undefined) states.delete(key);
    else states.set(key, state);
  }
}

export function episodeOpeners(journal: readonly JournalEvent[]): ReadonlySet<JournalEvent> {
  const states = episodeStates(journal);
  const seenKeys = new Set<EpisodeKey>();
  const openers = new Set<JournalEvent>();
  for (const event of journal.toReversed()) {
    const key = openingKey(event);
    if (key === null || seenKeys.has(key)) continue;
    seenKeys.add(key);
    if (states.get(key) === "open") openers.add(event);
  }
  return openers;
}

function openingKey(event: JournalEvent): EpisodeKey | null {
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

function episodeKey(task: string, evidence: CandidateEvidence): EpisodeKey {
  return `${task}:${evidence}` as EpisodeKey;
}

function filteredKey(task: string, symbol: string): EpisodeKey {
  return `filtered:${task}:${symbol}` as EpisodeKey;
}

function dedupeSightings(sightings: readonly CandidateSighting[]): CandidateSighting[] {
  const byKey = new Map(sightings.map((sighting) => [episodeKey(sighting.task, sighting.evidence), sighting]));
  return [...byKey.values()];
}
