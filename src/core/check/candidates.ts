import type { Task } from "../model/types";
import { anchorOf, findMoved, sourceLines } from "./anchor";
import type { Commit, RepoFacts } from "./repo-facts";
import { similarTitles } from "./similar-titles";

export type TaskRef = { id: string; title: string };
export type CommitRef = { sha: string; subject: string };

export type Candidate =
  | { kind: "source-missing"; task: TaskRef; path: string; renamedTo?: string }
  | { kind: "source-changed"; task: TaskRef; path: string; commits: CommitRef[]; uncommitted: boolean; problem?: string; snippet?: string; diff?: string }
  | { kind: "duplicate"; task: TaskRef; other: TaskRef; match: "source" | "title" }
  | { kind: "no-source"; task: TaskRef };

export type AnchorPlan = { id: string; changes: { source?: string; anchor: string }; note?: string };

type AnchorState = { kind: "none" } | { kind: "same" } | { kind: "moved"; source: string } | { kind: "changed" };

const MAX_COMMITS = 3;
const LINE_SUFFIX = /:\d+(?:-\d+)?$/;

export function isReviewable(task: Task): boolean {
  return task.type === "task" && (task.status === "backlog" || task.status === "blocked");
}

export function sourcePath(source: string): string {
  return source
    .replace(LINE_SUFFIX, "")
    .replace(/^\.\//, "")
    .replace(/\/+$/, "");
}

export function reviewMark(task: Task): number {
  const verified = task.verified === undefined ? Number.NEGATIVE_INFINITY : Date.parse(task.verified);
  return Math.max(Date.parse(task.created), verified);
}

export function codeCandidates(tasks: readonly Task[], facts: RepoFacts): Candidate[] {
  return tasks.flatMap((task): Candidate[] => {
    if (task.source === undefined) return [];
    const path = sourcePath(task.source);
    const mark = reviewMark(task);
    if (!facts.existing.has(path)) {
      return [{ kind: "source-missing", task: taskRef(task), path, renamedTo: followRenames(path, facts.commits, mark) }];
    }

    const anchor = anchorState(task, facts);
    if (anchor.kind === "same" || anchor.kind === "moved") return [];
    const commits = commitsAfter(facts.commits, mark).filter((commit) => touches(commit, path));
    const uncommitted = [...facts.dirtyModifiedAt].some(([file, modifiedAt]) => isWithin(file, path) && modifiedAt > mark);
    if (anchor.kind === "none" && commits.length === 0 && !uncommitted) return [];
    return [{ kind: "source-changed", task: taskRef(task), path, commits: commits.slice(0, MAX_COMMITS).map(commitRef), uncommitted }];
  });
}

export function anchorPlans(tasks: readonly Task[], facts: RepoFacts, candidates: readonly Candidate[]): AnchorPlan[] {
  const flagged = new Set(candidates.map((candidate) => candidate.task.id));
  return tasks.flatMap((task): AnchorPlan[] => {
    if (task.source === undefined || sourceLines(task.source) === null) return [];
    const state = anchorState(task, facts);
    if (state.kind === "moved" && task.anchor !== undefined) {
      return [{ id: task.id, changes: { source: state.source, anchor: task.anchor }, note: `${task.id}: source сдвинулся ${lineSuffix(task.source)} → ${lineSuffix(state.source)}` }];
    }
    if (state.kind !== "none" || task.anchor !== undefined || flagged.has(task.id)) return [];
    const text = facts.texts.get(sourcePath(task.source));
    const anchor = text === undefined ? null : anchorOf(text, task.source);
    return anchor === null ? [] : [{ id: task.id, changes: { anchor } }];
  });
}

function anchorState(task: Task, facts: RepoFacts): AnchorState {
  if (task.anchor === undefined || task.source === undefined) return { kind: "none" };
  const text = facts.texts.get(sourcePath(task.source));
  if (text === undefined || sourceLines(task.source) === null) return { kind: "none" };
  if (anchorOf(text, task.source) === task.anchor) return { kind: "same" };
  const moved = findMoved(text, task.source, task.anchor);
  return moved === null ? { kind: "changed" } : { kind: "moved", source: moved };
}

function lineSuffix(source: string): string {
  return LINE_SUFFIX.exec(source)?.[0] ?? "";
}

export function duplicateCandidates(tasks: readonly Task[]): Candidate[] {
  return tasks.flatMap((task, index) =>
    tasks.slice(0, index).flatMap((older): Candidate[] => {
      const match = duplicateMatch(task, older);
      return match === null ? [] : [{ kind: "duplicate", task: taskRef(task), other: taskRef(older), match }];
    }),
  );
}

export function noSourceCandidates(tasks: readonly Task[], facts: RepoFacts): Candidate[] {
  return tasks
    .filter((task) => task.source === undefined && commitsAfter(facts.commits, reviewMark(task)).length > 0)
    .map((task) => ({ kind: "no-source", task: taskRef(task) }));
}

function duplicateMatch(task: Task, other: Task): "source" | "title" | null {
  if (linked(task, other) || bothConfirmedAfterCreation(task, other)) return null;
  if (task.source !== undefined && other.source !== undefined && samePlace(task.source, other.source)) return "source";
  return similarTitles(task.title, other.title) ? "title" : null;
}

function samePlace(a: string, b: string): boolean {
  return sourcePath(a) === sourcePath(b) && LINE_SUFFIX.exec(a)?.[0] === LINE_SUFFIX.exec(b)?.[0];
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
