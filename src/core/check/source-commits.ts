import { isWithin } from "../model/source";
import type { Task } from "../model/types";
import type { Commit, RepoFacts } from "./repo-facts";
import { reviewMark } from "./reviewed-task";

export type LateCommits = ReadonlyMap<string, readonly Commit[]>;

export type SourceHistory = { facts: RepoFacts; late: LateCommits };

export function changesSinceMark({ facts, late }: SourceHistory, task: Task, path: string): { commits: Commit[]; uncommitted: boolean } {
  const mark = reviewMark(task);
  const commits = [...commitsTouchingSince(facts.commits, path, mark), ...(late.get(task.id) ?? [])];
  const uncommitted = [...facts.dirtyModifiedAt].some(([file, modifiedAt]) => isWithin(file, path) && modifiedAt > mark);
  return { commits, uncommitted };
}

export function commitsTouchingSince(commits: readonly Commit[], path: string, mark: number): Commit[] {
  return commitsAfter(commits, mark).filter((commit) => touches(commit, path));
}

export function commitsTouchingUntil(commits: readonly Commit[], path: string, mark: number): Commit[] {
  return commits.filter((commit) => Date.parse(commit.date) <= mark && touches(commit, path));
}

export function commitsAfter(commits: readonly Commit[], mark: number): Commit[] {
  return commits.filter((commit) => Date.parse(commit.date) > mark);
}

function touches(commit: Commit, path: string): boolean {
  return commit.files.some((file) => isWithin(file.path, path) || (file.renamedFrom !== undefined && isWithin(file.renamedFrom, path)));
}
