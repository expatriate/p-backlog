import type { CheckMethod, DuplicateMatch } from "../journal/events";
import type { Task } from "../model/types";
import { anchorOf, findMoved, isAnchorFor } from "./anchor";
import type { CheckFix } from "./findings";
import type { Commit, RepoFacts } from "./repo-facts";
import { hasLines, isWithin, lineSuffix, sourcePath } from "../model/source";

export type TaskRef = { id: string; title: string };
type CommitRef = { sha: string; subject: string };

type SourceChange = { kind: "source-changed"; task: TaskRef; path: string; commits: CommitRef[]; uncommitted: boolean; method: CheckMethod };

export type Candidate = { kind: "source-missing"; task: TaskRef; path: string; renamedTo?: string | undefined } | SourceChange | { kind: "duplicate"; task: TaskRef; other: TaskRef; match: DuplicateMatch };

export type ChangeContext = { source?: string; problem?: string; snippet?: string; diff?: string; diffOmittedLines?: number };

export type ReportedCandidate = Candidate | (SourceChange & ChangeContext);

export type AnchorPlan = { id: string; changes: { source?: string; anchor: string }; moved?: CheckFix };

export type CodeReview = { candidates: Candidate[]; plans: AnchorPlan[] };

export type KnownCommits = ReadonlyMap<string, ReadonlySet<string>>;

type AnchoredSource = { source: string; anchor: string };

type AnchorState = { kind: "none" } | ({ kind: "same" | "moved" } & AnchoredSource) | { kind: "changed" };

export type AnchorStates = ReadonlyMap<string, AnchorState>;

const MAX_COMMITS = 3;

export function isReviewable(task: Task): boolean {
  return task.type === "task" && (task.status === "backlog" || task.status === "blocked");
}

export function sourcePaths(tasks: readonly Task[]): string[] {
  return [...new Set(tasks.flatMap((task) => (task.source === undefined ? [] : [sourcePath(task.source)])))];
}

export function reviewMark(task: Task): number {
  const verified = task.verified === undefined ? Number.NEGATIVE_INFINITY : Date.parse(task.verified);
  return Math.max(Date.parse(task.created), verified);
}

export function anchorStates(tasks: readonly Task[], facts: RepoFacts): AnchorStates {
  return new Map(tasks.map((task) => [task.id, anchorState(task, facts)]));
}

export function codeReview(tasks: readonly Task[], facts: RepoFacts, knownCommits: KnownCommits, anchors: AnchorStates): CodeReview {
  const reviewed = tasks.map((task) => ({ task, anchor: anchors.get(task.id) ?? anchorState(task, facts) }));
  const candidates = reviewed.flatMap(({ task, anchor }) => codeCandidate(task, anchor, facts, knownCommits.get(task.id)));
  const plans = reviewed.flatMap(({ task, anchor }) => anchorPlan(task, anchor, facts));
  return { candidates, plans };
}

function codeCandidate(task: Task, anchor: AnchorState, facts: RepoFacts, knownCommits: ReadonlySet<string> = new Set()): Candidate[] {
  if (task.source === undefined) return [];
  const path = sourcePath(task.source);
  const mark = reviewMark(task);
  if (!facts.existing.has(path)) {
    return livesOnAnotherBranch(path, facts) ? [] : [{ kind: "source-missing", task: taskRef(task), path, renamedTo: followRenames(path, facts.renames, mark) }];
  }
  if (anchor.kind === "same" || anchor.kind === "moved") return [];
  const { commits: changed, uncommitted } = changesSince(facts, path, mark);
  const commits = changed.filter((commit) => !knownCommits.has(commit.sha));
  if (anchor.kind === "none" && commits.length === 0 && !uncommitted) return [];
  const method: CheckMethod = anchor.kind === "changed" ? "anchor" : "file";
  return [{ kind: "source-changed", task: taskRef(task), path, commits: commits.slice(0, MAX_COMMITS).map(commitRef), uncommitted, method }];
}

function anchorPlan(task: Task, anchor: AnchorState, facts: RepoFacts): AnchorPlan[] {
  if (task.source === undefined) return [];
  if (anchor.kind === "moved") return [movedPlan(task.id, task.source, anchor)];
  if (anchor.kind === "same") return [];
  const text = facts.texts.get(sourcePath(task.source));
  const fresh = text === undefined ? null : anchorOf(text, task.source);
  return fresh === null || fresh === task.anchor ? [] : [{ id: task.id, changes: { anchor: fresh } }];
}

export function renamePlan(task: Task, renamedTo: string, text: string): AnchorPlan | null {
  if (task.source === undefined) return null;
  const anchor = anchorStateIn({ ...task, source: `${renamedTo}${lineSuffix(task.source)}` }, text);
  return anchor.kind === "same" || anchor.kind === "moved" ? movedPlan(task.id, task.source, anchor) : null;
}

export function relocationPlan(task: Task, current: string, facts: RepoFacts): AnchorPlan | null {
  if (task.source === undefined || current === task.source) return null;
  const text = facts.texts.get(sourcePath(current));
  const anchor = text === undefined ? null : anchorOf(text, current);
  return anchor === null ? null : movedPlan(task.id, task.source, { source: current, anchor });
}

function movedPlan(id: string, from: string, to: AnchoredSource): AnchorPlan {
  return { id, changes: { source: to.source, anchor: to.anchor }, moved: { kind: "source-moved", taskId: id, from, to: to.source } };
}

export function changesSince(facts: RepoFacts, path: string, mark: number): { commits: Commit[]; uncommitted: boolean } {
  const commits = commitsTouchingSince(facts.commits, path, mark);
  const uncommitted = [...facts.dirtyModifiedAt].some(([file, modifiedAt]) => isWithin(file, path) && modifiedAt > mark);
  return { commits, uncommitted };
}

export function judgedByCommits(task: Task, anchors: AnchorStates): boolean {
  return task.source !== undefined && anchors.get(task.id)?.kind === "none";
}

function anchorState(task: Task, facts: RepoFacts): AnchorState {
  return anchorStateIn(task, task.source === undefined ? undefined : facts.texts.get(sourcePath(task.source)));
}

function anchorStateIn(task: Task, text: string | undefined): AnchorState {
  if (task.anchor === undefined || task.source === undefined || !hasLines(task.source) || !isAnchorFor(task.anchor, task.source)) return { kind: "none" };
  if (text === undefined) return { kind: "none" };
  if (anchorOf(text, task.source) === task.anchor) return { kind: "same", source: task.source, anchor: task.anchor };
  const moved = findMoved(text, task.source, task.anchor);
  const movedAnchor = moved === null ? null : anchorOf(text, moved);
  return moved === null || movedAnchor === null ? { kind: "changed" } : { kind: "moved", source: moved, anchor: movedAnchor };
}

function livesOnAnotherBranch(path: string, facts: RepoFacts): boolean {
  const committedIn = (files: ReadonlySet<string>) => [...files].some((file) => isWithin(file, path));
  return !committedIn(facts.committedHere) && committedIn(facts.committedAnywhere);
}

function followRenames(path: string, commits: readonly Commit[], mark: number): string | undefined {
  let current = path;
  for (const commit of commitsAfter(commits, mark).toReversed()) {
    const move = commit.files.find((file) => file.renamedFrom === current);
    if (move) current = move.path;
  }
  return current === path ? undefined : current;
}

export function commitsTouchingSince(commits: readonly Commit[], path: string, mark: number): Commit[] {
  return commitsAfter(commits, mark).filter((commit) => touches(commit, path));
}

function commitsAfter(commits: readonly Commit[], mark: number): Commit[] {
  return commits.filter((commit) => Date.parse(commit.date) > mark);
}

function touches(commit: Commit, path: string): boolean {
  return commit.files.some((file) => isWithin(file.path, path) || (file.renamedFrom !== undefined && isWithin(file.renamedFrom, path)));
}

export function taskRef(task: Task): TaskRef {
  return { id: task.id, title: task.title };
}

function commitRef(commit: Commit): CommitRef {
  return { sha: commit.sha, subject: commit.subject };
}
