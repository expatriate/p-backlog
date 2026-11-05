import { runGit } from "../git/run";
import type { TaskOrigin } from "../journal/events";
import type { Task } from "../model/types";
import { remembered } from "../remembered";
import { anchorOf, anchorRange, locateAnchor, remappedSource, windowMatches } from "./anchor";
import { reviewMark } from "./reviewed-task";
import { changesSince } from "./source-commits";
import { baseText, currentLine, modifiesLines, type Hunk } from "./diff-hunks";
import { collectRepoFacts, diffsFrom, diffsSince, headsAt, type Commit, type DiffFrom, type DiffSince, type FileDiff, type HeadAt, type RepoFacts } from "./repo-facts";
import { hasLines, sourcePath } from "../model/source";

export type TaskDiff = (task: Task, path: string) => Promise<FileDiff | null>;

type FileDiffs = { since: DiffSince; from: DiffFrom; headAt: HeadAt; sinceTaskMark: TaskDiff };

type SourceTrace = { kind: "traced"; current: string | null; linesChanged: boolean } | { kind: "not-on-branch" } | { kind: "untraced" };

export type SourceTraces = ReadonlyMap<string, SourceTrace>;

export type CurrentSources = ReadonlyMap<string, string | null>;

const LATER_COMMITS_TO_SEARCH = 5;

const UNTRACED: SourceTrace = { kind: "untraced" };

export function repoDiffs(repo: string, origins: ReadonlyMap<string, TaskOrigin>): FileDiffs {
  const from = diffsFrom(repo);
  const since = diffsSince(repo, runGit, from);
  return { since, from, headAt: headsAt(repo), sinceTaskMark: diffsSinceTaskMark(repo, since, from, origins) };
}

function diffsSinceTaskMark(repo: string, since: DiffSince, from: DiffFrom, origins: ReadonlyMap<string, TaskOrigin>): TaskDiff {
  const onThisLine = new Map<string, Promise<boolean>>();
  const isOnThisLine = (commit: string) => remembered(onThisLine, commit, async () => (await runGit(repo, ["merge-base", "--is-ancestor", commit, "HEAD"])) !== null);
  return async (task, path) => {
    const origin = task.verified === undefined ? origins.get(task.id) : undefined;
    return origin !== undefined && (await isOnThisLine(origin.commit)) ? from(path, origin.commit) : since(path, new Date(reviewMark(task)));
  };
}

export async function traceSources(tasks: readonly Task[], facts: RepoFacts, diffs: FileDiffs): Promise<SourceTraces> {
  return new Map(await Promise.all(tasks.map(async (task) => [task.id, await traceSource(task, facts, diffs)] as const)));
}

export function currentSourcesOf(traces: SourceTraces): CurrentSources {
  return new Map([...traces].map(([id, trace]) => [id, currentOf(trace)]));
}

export async function currentSourceIn(repo: string, task: Task): Promise<string | null> {
  if (task.source === undefined) return null;
  const facts = await collectRepoFacts(repo, new Map([[sourcePath(task.source), reviewMark(task)]]));
  return currentOf(await traceSource(task, facts, repoDiffs(repo, new Map())));
}

function currentOf(trace: SourceTrace): string | null {
  return trace.kind === "traced" ? trace.current : null;
}

type FoundReference = { kind: "found"; hunks: readonly Hunk[]; source: string };

type ReferenceSearch = FoundReference | { kind: "not-on-branch" } | { kind: "untraced" };

type Traced = Task & { source: string };

async function traceSource(task: Task, facts: RepoFacts, diffs: FileDiffs): Promise<SourceTrace> {
  const { source, anchor } = task;
  if (source === undefined || !hasLines(source)) return UNTRACED;
  const text = facts.texts.get(sourcePath(source));
  if (text === undefined) return UNTRACED;
  const { commits, uncommitted } = changesSince(facts, sourcePath(source), reviewMark(task));
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
  const headAtMark = async () => (head?.onThisLine === true ? diffs.from(path, head.commit) : null);
  const lastCommitBeforeMark = () => diffs.since(path, mark);
  const sinceTaskMark = () => diffs.sinceTaskMark(task, path);
  const afterMark = laterCommits
    .toReversed()
    .slice(0, LATER_COMMITS_TO_SEARCH)
    .map((commit) => () => diffs.from(path, commit.sha));
  const references = anchor === undefined ? [sinceTaskMark] : [headAtMark, lastCommitBeforeMark, ...afterMark];
  const unmatched: ReferenceSearch = head?.onThisLine === false ? { kind: "not-on-branch" } : { kind: "untraced" };
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
