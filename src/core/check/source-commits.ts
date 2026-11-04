import { isWithin } from "../model/source";
import type { Commit, RepoFacts } from "./repo-facts";

export function changesSince(facts: RepoFacts, path: string, mark: number): { commits: Commit[]; uncommitted: boolean } {
  const commits = commitsTouchingSince(facts.commits, path, mark);
  const uncommitted = [...facts.dirtyModifiedAt].some(([file, modifiedAt]) => isWithin(file, path) && modifiedAt > mark);
  return { commits, uncommitted };
}

export function commitsTouchingSince(commits: readonly Commit[], path: string, mark: number): Commit[] {
  return commitsAfter(commits, mark).filter((commit) => touches(commit, path));
}

export function commitsAfter(commits: readonly Commit[], mark: number): Commit[] {
  return commits.filter((commit) => Date.parse(commit.date) > mark);
}

function touches(commit: Commit, path: string): boolean {
  return commit.files.some((file) => isWithin(file.path, path) || (file.renamedFrom !== undefined && isWithin(file.renamedFrom, path)));
}
