import type { Task } from "../model/types";
import { anchorOf, anchorRange, locateAnchor, remappedSource } from "./anchor";
import { changesSince, reviewMark } from "./candidates";
import { baseText, currentLine, modifiesLines, type Hunk } from "./diff-hunks";
import { collectRepoFacts, diffsFrom, diffsSince, headsOnThisLine, type Commit, type DiffFrom, type DiffSince, type HeadAt, type RepoFacts } from "./repo-facts";
import { hasLines, sourcePath } from "../model/source";

type FileDiffs = { since: DiffSince; from: DiffFrom; headAt: HeadAt };

type SourceTrace = { kind: "traced"; current: string | null; linesChanged: boolean } | { kind: "not-on-branch" } | { kind: "untraced" };

export type SourceTraces = ReadonlyMap<string, SourceTrace>;

export type CurrentSources = ReadonlyMap<string, string | null>;

const LATER_COMMITS_TO_SEARCH = 5;

const UNTRACED: SourceTrace = { kind: "untraced" };

export function repoDiffs(repo: string): FileDiffs {
  return { since: diffsSince(repo), from: diffsFrom(repo), headAt: headsOnThisLine(repo) };
}

export async function traceSources(tasks: readonly Task[], facts: RepoFacts, diffs: FileDiffs): Promise<SourceTraces> {
  return new Map(await Promise.all(tasks.map(async (task) => [task.id, await traceSource(task, facts, diffs)] as const)));
}

export function currentSourcesOf(traces: SourceTraces): CurrentSources {
  return new Map([...traces].map(([id, trace]) => [id, trace.kind === "traced" ? trace.current : null]));
}

export async function currentSourceIn(repo: string, task: Task): Promise<string | null> {
  if (task.source === undefined) return null;
  const facts = await collectRepoFacts(repo, new Map([[sourcePath(task.source), reviewMark(task)]]));
  return currentSourcesOf(await traceSources([task], facts, repoDiffs(repo))).get(task.id) ?? null;
}

type Reference = { hunks: readonly Hunk[]; source: string };

type Traced = Task & { source: string };

async function traceSource(task: Task, facts: RepoFacts, diffs: FileDiffs): Promise<SourceTrace> {
  const { source, anchor } = task;
  if (source === undefined || !hasLines(source)) return UNTRACED;
  const text = facts.texts.get(sourcePath(source));
  if (text === undefined) return UNTRACED;
  const { commits, uncommitted } = changesSince(facts, sourcePath(source), reviewMark(task));
  const anchorHolds = anchor === undefined || anchorOf(text, source) === anchor;
  if (commits.length === 0 && !uncommitted && anchorHolds) return { kind: "traced", current: source, linesChanged: false };
  const reference = await referenceOf({ ...task, source }, text, commits, diffs);
  if (reference === "not-on-branch") return { kind: "not-on-branch" };
  if (reference === null) return UNTRACED;
  const current = remappedSource(reference.source, (line) => currentLine(reference.hunks, line));
  const located = current !== null && anchorOf(text, current) !== null ? current : null;
  const unanchoredShift = anchor === undefined && located !== source;
  const lines = anchorRange(reference.source);
  return { kind: "traced", current: unanchoredShift ? null : located, linesChanged: lines === null || modifiesLines(reference.hunks, lines) };
}

async function referenceOf(task: Traced, text: string, laterCommits: readonly Commit[], diffs: FileDiffs): Promise<Reference | "not-on-branch" | null> {
  const path = sourcePath(task.source);
  const { anchor } = task;
  const mark = new Date(reviewMark(task));
  const headAtMark = async () => {
    const head = await diffs.headAt(mark);
    return head === null ? null : diffs.from(path, head);
  };
  const lastCommitBeforeMark = () => diffs.since(path, mark);
  const afterMark = laterCommits
    .toReversed()
    .slice(0, LATER_COMMITS_TO_SEARCH)
    .map((commit) => () => diffs.from(path, commit.sha));
  const references = anchor === undefined ? [lastCommitBeforeMark] : [headAtMark, lastCommitBeforeMark, ...afterMark];
  let compared = false;
  for (const diffFromReference of references) {
    const hunks = (await diffFromReference())?.hunks ?? null;
    if (hunks === null) continue;
    compared = true;
    const source = anchor === undefined ? task.source : locateAnchor(baseText(hunks, text), task.source, anchor);
    if (source !== null) return { hunks, source };
  }
  return compared ? "not-on-branch" : null;
}
