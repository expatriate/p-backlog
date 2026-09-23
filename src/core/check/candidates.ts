import { isClosed } from "../model/graph";
import type { Task } from "../model/types";
import { anchorOf, findMoved, hasLines, isAnchorFor, lineSuffix, SOURCE_LINES } from "./anchor";
import type { Commit, RepoFacts } from "./repo-facts";
import { similarTitles } from "./similar-titles";

type TaskRef = { id: string; title: string };
type CommitRef = { sha: string; subject: string };

export type Candidate =
  | { kind: "source-missing"; task: TaskRef; path: string; renamedTo?: string  | undefined}
  | { kind: "source-changed"; task: TaskRef; path: string; commits: CommitRef[]; uncommitted: boolean; problem?: string; snippet?: string; diff?: string; bySymbol?: boolean; byAnchor?: boolean }
  | { kind: "duplicate"; task: TaskRef; other: TaskRef; match: "source" | "title" | "symbol" };

export type AnchorPlan = { id: string; changes: { source?: string; anchor: string }; note?: string };

export type CodeReview = { candidates: Candidate[]; plans: AnchorPlan[] };

type AnchorState = { kind: "none" } | { kind: "same" } | { kind: "moved"; source: string; anchor: string } | { kind: "changed" };

const MAX_COMMITS = 3;

export function isReviewable(task: Task): boolean {
  return task.type === "task" && (task.status === "backlog" || task.status === "blocked");
}

export function sourcePath(source: string): string {
  return source
    .replace(SOURCE_LINES, "")
    .replace(/^\.\//, "")
    .replace(/\/+$/, "");
}

export function reviewMark(task: Task): number {
  const verified = task.verified === undefined ? Number.NEGATIVE_INFINITY : Date.parse(task.verified);
  return Math.max(Date.parse(task.created), verified);
}

export function codeReview(tasks: readonly Task[], facts: RepoFacts): CodeReview {
  const reviewed = tasks.map((task) => ({ task, anchor: anchorState(task, facts) }));
  const candidates = reviewed.flatMap(({ task, anchor }) => codeCandidate(task, anchor, facts));
  const plans = reviewed.flatMap(({ task, anchor }) => anchorPlan(task, anchor, facts));
  return { candidates, plans };
}

function codeCandidate(task: Task, anchor: AnchorState, facts: RepoFacts): Candidate[] {
  if (task.source === undefined) return [];
  const path = sourcePath(task.source);
  const mark = reviewMark(task);
  if (!facts.existing.has(path)) {
    return [{ kind: "source-missing", task: taskRef(task), path, renamedTo: followRenames(path, facts.commits, mark) }];
  }
  if (anchor.kind === "same" || anchor.kind === "moved") return [];
  const commits = commitsAfter(facts.commits, mark).filter((commit) => touches(commit, path));
  const uncommitted = [...facts.dirtyModifiedAt].some(([file, modifiedAt]) => isWithin(file, path) && modifiedAt > mark);
  if (anchor.kind === "none" && commits.length === 0 && !uncommitted) return [];
  const byAnchor = anchor.kind === "changed" ? { byAnchor: true } : {};
  return [{ kind: "source-changed", task: taskRef(task), path, commits: commits.slice(0, MAX_COMMITS).map(commitRef), uncommitted, ...byAnchor }];
}

function anchorPlan(task: Task, anchor: AnchorState, facts: RepoFacts): AnchorPlan[] {
  if (task.source === undefined) return [];
  if (anchor.kind === "moved") {
    return [{ id: task.id, changes: { source: anchor.source, anchor: anchor.anchor }, note: `${task.id}: source сдвинулся ${lineSuffix(task.source)} → ${lineSuffix(anchor.source)}` }];
  }
  if (anchor.kind === "same") return [];
  const text = facts.texts.get(sourcePath(task.source));
  const fresh = text === undefined ? null : anchorOf(text, task.source);
  return fresh === null || fresh === task.anchor ? [] : [{ id: task.id, changes: { anchor: fresh } }];
}

function anchorState(task: Task, facts: RepoFacts): AnchorState {
  if (task.anchor === undefined || task.source === undefined || !hasLines(task.source) || !isAnchorFor(task.anchor, task.source)) return { kind: "none" };
  const text = facts.texts.get(sourcePath(task.source));
  if (text === undefined) return { kind: "none" };
  if (anchorOf(text, task.source) === task.anchor) return { kind: "same" };
  const moved = findMoved(text, task.source, task.anchor);
  const movedAnchor = moved === null ? null : anchorOf(text, moved);
  return moved === null || movedAnchor === null ? { kind: "changed" } : { kind: "moved", source: moved, anchor: movedAnchor };
}

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
  return tasks.flatMap((task, index) =>
    tasks.slice(0, index).flatMap((older): Candidate[] => {
      const match = duplicateMatch(task, older, symbolOf);
      return match === null ? [] : [{ kind: "duplicate", task: taskRef(task), other: taskRef(older), match }];
    }),
  );
}

function duplicateMatch(task: Task, other: Task, symbolOf: SymbolOf): "source" | "title" | "symbol" | null {
  if (linked(task, other) || bothConfirmedAfterCreation(task, other)) return null;
  if (task.source !== undefined && other.source !== undefined && samePlace(task.source, other.source)) return "source";
  const symbol = symbolOf(task);
  if (symbol !== null && symbol === symbolOf(other)) return "symbol";
  return similarTitles(task.title, other.title) ? "title" : null;
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

function followRenames(path: string, commits: readonly Commit[], mark: number): string | undefined {
  let current = path;
  for (const commit of commitsAfter(commits, mark).reverse()) {
    const move = commit.files.find((file) => file.renamedFrom === current);
    if (move) current = move.path;
  }
  return current === path ? undefined : current;
}

function commitsAfter(commits: readonly Commit[], mark: number): Commit[] {
  return commits.filter((commit) => Date.parse(commit.date) > mark);
}

function touches(commit: Commit, path: string): boolean {
  return commit.files.some((file) => isWithin(file.path, path) || (file.renamedFrom !== undefined && isWithin(file.renamedFrom, path)));
}

function isWithin(file: string, path: string): boolean {
  return file === path || file.startsWith(`${path}/`);
}

function taskRef(task: Task): TaskRef {
  return { id: task.id, title: task.title };
}

function commitRef(commit: Commit): CommitRef {
  return { sha: commit.sha, subject: commit.subject };
}
