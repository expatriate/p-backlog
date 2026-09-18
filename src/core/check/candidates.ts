import type { Task } from "../model/types";
import type { Commit, RepoFacts } from "./repo-facts";
import { similarTitles } from "./similar-titles";

export type TaskRef = { id: string; title: string };
export type CommitRef = { sha: string; subject: string };

export type Candidate =
  | { kind: "source-missing"; task: TaskRef; path: string; renamedTo?: string }
  | { kind: "source-changed"; task: TaskRef; path: string; commits: CommitRef[]; uncommitted: boolean }
  | { kind: "duplicate"; task: TaskRef; other: TaskRef; match: "source" | "title" }
  | { kind: "no-source"; task: TaskRef };

const MAX_COMMITS = 3;

export function isReviewable(task: Task): boolean {
  return task.type === "task" && (task.status === "backlog" || task.status === "blocked");
}

export function sourcePath(source: string): string {
  return source.replace(/:\d+(?:-\d+)?$/, "");
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

    const commits = commitsAfter(facts.commits, mark).filter((commit) => touches(commit, path));
    const uncommitted = (facts.dirtyModifiedAt.get(path) ?? Number.NEGATIVE_INFINITY) > mark;
    if (commits.length === 0 && !uncommitted) return [];
    return [{ kind: "source-changed", task: taskRef(task), path, commits: commits.slice(0, MAX_COMMITS).map(commitRef), uncommitted }];
  });
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
  if (task.source !== undefined && task.source === other.source) return "source";
  return similarTitles(task.title, other.title) ? "title" : null;
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
  return commit.files.some((file) => file.path === path || file.renamedFrom === path);
}

function taskRef(task: Task): TaskRef {
  return { id: task.id, title: task.title };
}

function commitRef(commit: Commit): CommitRef {
  return { sha: commit.sha, subject: commit.subject };
}
