import type { Task } from "../model/types";
import { anchorOf, anchorRange, locateAnchor, remappedSource, windowMatches } from "./anchor";
import { NO_MARK_COMMITS, reviewMark } from "./reviewed-task";
import { changesSinceMark, type SourceHistory } from "./source-commits";
import { baseText, currentLine, modifiesLines, type Hunk } from "./diff-hunks";
import { collectRepoFacts, type Commit, type FileDiff } from "./repo-facts";
import { markLineOf, taskBases, type TaskBase, type TaskBases } from "./task-base";
import { hasLines, sourcePath } from "../model/source";

export type TaskDiff = (task: Task, path: string) => Promise<FileDiff | null>;

type SourceTrace = { kind: "traced"; current: string | null; linesChanged: boolean } | { kind: "other-branch" } | { kind: "untraced" };

export type SourceTraces = ReadonlyMap<string, SourceTrace>;

export type CurrentSources = ReadonlyMap<string, string | null>;

const LATER_COMMITS_TO_SEARCH = 5;

const UNTRACED: SourceTrace = { kind: "untraced" };

export async function traceSources(tasks: readonly Task[], history: SourceHistory, bases: TaskBases): Promise<SourceTraces> {
  return new Map(await Promise.all(tasks.map(async (task) => [task.id, await traceSource(task, history, bases)] as const)));
}

export function currentSourcesOf(traces: SourceTraces): CurrentSources {
  return new Map([...traces].map(([id, trace]) => [id, currentOf(trace)]));
}

export async function currentSourceIn(repo: string, task: Task): Promise<string | null> {
  if (task.source === undefined) return null;
  const facts = await collectRepoFacts(repo, new Map([[sourcePath(task.source), reviewMark(task)]]));
  return currentOf(await traceSource(task, { facts, late: new Map() }, taskBases(repo, NO_MARK_COMMITS)));
}

function currentOf(trace: SourceTrace): string | null {
  return trace.kind === "traced" ? trace.current : null;
}

type FoundReference = { kind: "found"; hunks: readonly Hunk[]; source: string };

type ReferenceSearch = FoundReference | { kind: "other-branch" } | { kind: "untraced" };

type Traced = Task & { source: string };

async function traceSource(task: Task, history: SourceHistory, bases: TaskBases): Promise<SourceTrace> {
  const { source, anchor } = task;
  if (source === undefined || !hasLines(source)) return UNTRACED;
  const text = history.facts.texts.get(sourcePath(source));
  if (text === undefined) return UNTRACED;
  const { commits, uncommitted } = changesSinceMark(history, task, sourcePath(source));
  const fileUntouched = commits.length === 0 && !uncommitted;
  if (fileUntouched && (anchor === undefined || windowMatches(text, source, anchor))) return { kind: "traced", current: source, linesChanged: false };
  const traced: Traced = { ...task, source };
  const reference = await referenceOf(traced, text, commits, bases);
  if (reference.kind === "other-branch") return fileUntouched ? reference : UNTRACED;
  if (reference.kind === "untraced") return UNTRACED;
  const lines = anchorRange(reference.source);
  return { kind: "traced", current: currentSource(reference, text, traced), linesChanged: lines === null || modifiesLines(reference.hunks, lines) };
}

function currentSource(reference: FoundReference, text: string, { source, anchor }: Traced): string | null {
  const current = remappedSource(reference.source, (line) => currentLine(reference.hunks, line));
  if (current === null || anchorOf(text, current) === null) return null;
  return anchor === undefined && current !== source ? null : current;
}

async function referenceOf(task: Traced, text: string, laterCommits: readonly Commit[], bases: TaskBases): Promise<ReferenceSearch> {
  const path = sourcePath(task.source);
  const { anchor } = task;
  const atBase = () => bases.diffSinceBase(task, path);
  const afterMark =
    anchor === undefined
      ? []
      : laterCommits
          .toReversed()
          .slice(0, LATER_COMMITS_TO_SEARCH)
          .map((commit) => () => bases.diffFrom(path, commit.sha));
  const unmatched = unmatchedOn(await bases.baseOf(task));
  let search: ReferenceSearch = { kind: "untraced" };
  for (const diffFromReference of [atBase, ...afterMark]) {
    const hunks = (await diffFromReference())?.hunks ?? null;
    if (hunks === null) continue;
    const source = anchor === undefined ? task.source : locateAnchor(baseText(hunks, text), task.source, anchor);
    if (source !== null) return { kind: "found", hunks, source };
    search = unmatched;
  }
  return search;
}

function unmatchedOn(base: TaskBase): ReferenceSearch {
  return markLineOf(base) === "other-branch" ? { kind: "other-branch" } : { kind: "untraced" };
}
