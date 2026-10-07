import type { DuplicateMatch } from "../journal/events";
import { isClosed } from "../model/graph";
import type { Task } from "../model/types";
import { taskRef, type Candidate, type TaskRef } from "./candidates";
import { nearlySameTitles, similarTitles, titleStems, type TitleStems } from "./similar-titles";
import { lineSuffix, sourcePath } from "../model/source";

type SourceTitleMatch = Exclude<DuplicateMatch, "symbol">;

export type SimilarTask = { task: TaskRef; match: SourceTitleMatch };

type Fingerprint = { source: string | undefined; stems: TitleStems };

type TaskFingerprint = Fingerprint & { task: Task };

export function findSimilarTask(draft: { title: string; source?: string | undefined }, tasks: readonly Task[]): SimilarTask | null {
  const draftFingerprint = { source: draft.source, stems: titleStems(draft.title) };
  const similar = tasks
    .filter((task) => task.type === "task" && !isClosed(task.status))
    .flatMap((task): SimilarTask[] => {
      const match = sourceTitleMatch(draftFingerprint, fingerprintOf(task));
      return match === null ? [] : [{ task: taskRef(task), match }];
    });
  return similar.find((found) => found.match === "source") ?? similar[0] ?? null;
}

export type SymbolOf = (task: Task) => string | null;

export function duplicateCandidates(tasks: readonly Task[], symbolOf: SymbolOf = () => null): Candidate[] {
  const fingerprints = tasks.map(fingerprintOf);
  return fingerprints.flatMap((current, index) =>
    fingerprints.slice(0, index).flatMap((older): Candidate[] => {
      const match = duplicateMatch(current, older, symbolOf);
      return match === null ? [] : [{ kind: "duplicate", task: taskRef(current.task), other: taskRef(older.task), match }];
    }),
  );
}

function fingerprintOf(task: Task): TaskFingerprint {
  return { task, source: task.source, stems: titleStems(task.title) };
}

function duplicateMatch(current: TaskFingerprint, older: TaskFingerprint, symbolOf: SymbolOf): DuplicateMatch | null {
  if (linked(current.task, older.task) || bothConfirmedAfterCreation(current.task, older.task)) return null;
  const match = sourceTitleMatch(current, older);
  if (match === "source") return match;
  return similarTitles(current.stems, older.stems) && inOneSymbol(current.task, older.task, symbolOf) ? "symbol" : match;
}

function sourceTitleMatch(left: Fingerprint, right: Fingerprint): SourceTitleMatch | null {
  const place = sharedPlace(left.source, right.source);
  if (place === null) return nearlySameTitles(left.stems, right.stems) ? "title" : null;
  if (!similarTitles(left.stems, right.stems)) return null;
  return place === "line" ? "source" : "title";
}

function sharedPlace(a: string | undefined, b: string | undefined): "line" | "file" | null {
  if (a === undefined || b === undefined || sourcePath(a) !== sourcePath(b)) return null;
  return lineSuffix(a) === lineSuffix(b) ? "line" : "file";
}

function inOneSymbol(a: Task, b: Task, symbolOf: SymbolOf): boolean {
  const symbol = symbolOf(a);
  return symbol !== null && symbol === symbolOf(b);
}

function linked(a: Task, b: Task): boolean {
  return a.related.includes(b.id) || b.related.includes(a.id);
}

function bothConfirmedAfterCreation(a: Task, b: Task): boolean {
  const createdLast = Math.max(Date.parse(a.created), Date.parse(b.created));
  return [a, b].every((task) => task.verified !== undefined && Date.parse(task.verified) > createdLast);
}
