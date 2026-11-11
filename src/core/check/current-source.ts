import { runGit } from "../git/run";
import type { TaskOrigin } from "../journal/events";
import type { Task } from "../model/types";
import { anchorOf, anchorRange, locateAnchor, remappedSource, windowMatches } from "./anchor";
import { checkoutAtMark, reviewMark } from "./reviewed-task";
import { changesSinceMark, type SourceHistory } from "./source-commits";
import { baseText, currentLine, modifiesLines, type Hunk } from "./diff-hunks";
import {
  collectRepoFacts,
  diffsFrom,
  diffsSince,
  headCommitsAt,
  headLineOf,
  headsAt,
  type Commit,
  type DiffFrom,
  type DiffSince,
  type FileDiff,
  type HeadAt,
  type HeadLine,
  type HeadLineOf,
} from "./repo-facts";
import { hasLines, sourcePath } from "../model/source";

export type TaskDiff = (task: Task, path: string) => Promise<FileDiff | null>;

export type LineAtMark = (task: Task) => Promise<HeadLine | null>;

type FileDiffs = { since: DiffSince; from: DiffFrom; headAt: HeadAt; sinceTaskMark: TaskDiff; lineAtMark: LineAtMark };

type SourceTrace = { kind: "traced"; current: string | null; linesChanged: boolean } | { kind: "not-on-branch" } | { kind: "untraced" };

export type SourceTraces = ReadonlyMap<string, SourceTrace>;

export type CurrentSources = ReadonlyMap<string, string | null>;

const LATER_COMMITS_TO_SEARCH = 5;

const UNTRACED: SourceTrace = { kind: "untraced" };

export function repoDiffs(repo: string, origins: ReadonlyMap<string, TaskOrigin>, headLine: HeadLineOf = headLineOf(repo)): FileDiffs {
  const from = diffsFrom(repo);
  const since = diffsSince(repo, runGit, from);
  const headCommitAt = headCommitsAt(repo);
  const checkoutLineAtMark = async (task: Task) => {
    const checkout = await checkoutAtMark(task, origins, headCommitAt);
    return checkout === null ? null : { checkout, line: await headLine(checkout) };
  };
  const sinceTaskMark: TaskDiff = async (task, path) => {
    const atMark = await checkoutLineAtMark(task);
    const sinceMark = () => since(path, new Date(reviewMark(task)));
    if (atMark === null) return sinceMark();
    switch (atMark.line) {
      case "this-line":
        return from(path, atMark.checkout);
      case "other-branch":
      case "missing":
        return sinceMark();
      case "unknown":
        return null;
    }
  };
  const lineAtMark: LineAtMark = async (task) => (await checkoutLineAtMark(task))?.line ?? null;
  return { since, from, headAt: headsAt(headCommitAt, headLine), sinceTaskMark, lineAtMark };
}

export async function traceSources(tasks: readonly Task[], history: SourceHistory, diffs: FileDiffs): Promise<SourceTraces> {
  return new Map(await Promise.all(tasks.map(async (task) => [task.id, await traceSource(task, history, diffs)] as const)));
}

export function currentSourcesOf(traces: SourceTraces): CurrentSources {
  return new Map([...traces].map(([id, trace]) => [id, currentOf(trace)]));
}

export async function currentSourceIn(repo: string, task: Task): Promise<string | null> {
  if (task.source === undefined) return null;
  const facts = await collectRepoFacts(repo, new Map([[sourcePath(task.source), reviewMark(task)]]));
  return currentOf(await traceSource(task, { facts, late: new Map() }, repoDiffs(repo, new Map())));
}

function currentOf(trace: SourceTrace): string | null {
  return trace.kind === "traced" ? trace.current : null;
}

type FoundReference = { kind: "found"; hunks: readonly Hunk[]; source: string };

type ReferenceSearch = FoundReference | { kind: "not-on-branch" } | { kind: "untraced" };

type Traced = Task & { source: string };

async function traceSource(task: Task, history: SourceHistory, diffs: FileDiffs): Promise<SourceTrace> {
  const { source, anchor } = task;
  if (source === undefined || !hasLines(source)) return UNTRACED;
  const text = history.facts.texts.get(sourcePath(source));
  if (text === undefined) return UNTRACED;
  const { commits, uncommitted } = changesSinceMark(history, task, sourcePath(source));
  const fileUntouched = commits.length === 0 && !uncommitted;
  if (fileUntouched && (anchor === undefined || windowMatches(text, source, anchor))) return { kind: "traced", current: source, linesChanged: false };
  const traced: Traced = { ...task, source };
  const reference = await referenceOf(traced, text, commits, diffs);
  if (reference.kind === "not-on-branch") return fileUntouched ? { kind: "not-on-branch" } : UNTRACED;
  if (reference.kind === "untraced") return UNTRACED;
  const lines = anchorRange(reference.source);
  return { kind: "traced", current: currentSource(reference, text, traced), linesChanged: lines === null || modifiesLines(reference.hunks, lines) };
}

function currentSource(reference: FoundReference, text: string, { source, anchor }: Traced): string | null {
  const current = remappedSource(reference.source, (line) => currentLine(reference.hunks, line));
  if (current === null || anchorOf(text, current) === null) return null;
  return anchor === undefined && current !== source ? null : current;
}

async function referenceOf(task: Traced, text: string, laterCommits: readonly Commit[], diffs: FileDiffs): Promise<ReferenceSearch> {
  const path = sourcePath(task.source);
  const { anchor } = task;
  const mark = new Date(reviewMark(task));
  const head = anchor === undefined ? null : await diffs.headAt(mark);
  const headAtMark = async () => (head?.line === "this-line" ? diffs.from(path, head.commit) : null);
  const lastCommitBeforeMark = () => diffs.since(path, mark);
  const sinceTaskMark = () => diffs.sinceTaskMark(task, path);
  const afterMark = laterCommits
    .toReversed()
    .slice(0, LATER_COMMITS_TO_SEARCH)
    .map((commit) => () => diffs.from(path, commit.sha));
  const references = anchor === undefined ? [sinceTaskMark] : [headAtMark, lastCommitBeforeMark, ...afterMark];
  const unmatched: ReferenceSearch = head === null ? { kind: "untraced" } : unmatchedOn(head.line);
  let search: ReferenceSearch = { kind: "untraced" };
  for (const diffFromReference of references) {
    const hunks = (await diffFromReference())?.hunks ?? null;
    if (hunks === null) continue;
    const source = anchor === undefined ? task.source : locateAnchor(baseText(hunks, text), task.source, anchor);
    if (source !== null) return { kind: "found", hunks, source };
    search = unmatched;
  }
  return search;
}

function unmatchedOn(line: HeadLine): ReferenceSearch {
  switch (line) {
    case "other-branch":
    case "missing":
      return { kind: "not-on-branch" };
    case "this-line":
    case "unknown":
      return { kind: "untraced" };
  }
}
