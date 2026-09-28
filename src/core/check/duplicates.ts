import type { DuplicateMatch } from "../journal/events";
import { isClosed } from "../model/graph";
import type { Task } from "../model/types";
import { taskRef, type Candidate, type TaskRef } from "./candidates";
import { similarStems, similarTitles, titleStems } from "./similar-titles";
import { lineSuffix, sourcePath } from "../model/source";

export type SimilarTask = { task: TaskRef; match: "source" | "title" };

export function findSimilarTask(draft: { title: string; source?: string | undefined }, tasks: readonly Task[]): SimilarTask | null {
  const open = tasks.filter((task) => task.type === "task" && !isClosed(task.status));
  const { source } = draft;
  const bySource = source === undefined ? undefined : open.find((task) => task.source !== undefined && samePlace(task.source, source));
  if (bySource !== undefined) return { task: taskRef(bySource), match: "source" };
  const byTitle = open.find((task) => similarTitles(task.title, draft.title));
  return byTitle === undefined ? null : { task: taskRef(byTitle), match: "title" };
}

export type SymbolOf = (task: Task) => string | null;

export function duplicateCandidates(tasks: readonly Task[], symbolOf: SymbolOf = () => null): Candidate[] {
  const titled = tasks.map((task) => ({ task, stems: titleStems(task.title) }));
  return titled.flatMap((current, index) =>
    titled.slice(0, index).flatMap((older): Candidate[] => {
      const match = duplicateMatch(current, older, symbolOf);
      return match === null ? [] : [{ kind: "duplicate", task: taskRef(current.task), other: taskRef(older.task), match }];
    }),
  );
}

type TitledTask = { task: Task; stems: ReadonlySet<string> };

function duplicateMatch({ task, stems }: TitledTask, other: TitledTask, symbolOf: SymbolOf): DuplicateMatch | null {
  if (linked(task, other.task) || bothConfirmedAfterCreation(task, other.task)) return null;
  if (task.source !== undefined && other.task.source !== undefined && samePlace(task.source, other.task.source)) return "source";
  const symbol = symbolOf(task);
  if (symbol !== null && symbol === symbolOf(other.task)) return "symbol";
  return similarStems(stems, other.stems) ? "title" : null;
}

function samePlace(a: string, b: string): boolean {
  return sourcePath(a) === sourcePath(b) && lineSuffix(a) === lineSuffix(b);
}

function linked(a: Task, b: Task): boolean {
  return a.related.includes(b.id) || b.related.includes(a.id);
}

function bothConfirmedAfterCreation(a: Task, b: Task): boolean {
  const createdLast = Math.max(Date.parse(a.created), Date.parse(b.created));
  return [a, b].every((task) => task.verified !== undefined && Date.parse(task.verified) > createdLast);
}
