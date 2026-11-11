import { asGitRunner, cloneCompletenessOf, headAncestryOf, runGitOutcome, type CloneCompleteness, type GitOutcomeRunner, type HeadAncestry } from "../git/run";
import type { Task } from "../model/types";
import { remembered } from "../remembered";
import { diffsFrom, diffsSince, headCommitsAt, headLineOf, type DiffFrom, type FileDiff, type HeadAncestryOf, type HeadLine } from "./repo-facts";
import { commitAtMark, reviewMark, type MarkCommits } from "./reviewed-task";

type MarkLine = Exclude<HeadLine, "missing">;

export type TaskBase = { kind: "exact"; commit: string } | { kind: "approximate"; since: Date; markLine: MarkLine } | { kind: "unknown" };

export type TaskBases = {
  markCommit: (task: Task) => Promise<string | null>;
  baseOf: (task: Task) => Promise<TaskBase>;
  diffSinceBase: (task: Task, path: string) => Promise<FileDiff | null>;
  diffFrom: DiffFrom;
  ancestry: HeadAncestryOf;
  cloneCompleteness: () => Promise<CloneCompleteness>;
};

export function taskBases(repo: string, marks: MarkCommits, gitOutcome: GitOutcomeRunner = runGitOutcome): TaskBases {
  const git = asGitRunner(gitOutcome);
  const diffFrom = diffsFrom(repo, git);
  const diffSince = diffsSince(repo, git, diffFrom);
  const headCommitAt = headCommitsAt(repo, git);
  const ancestries = new Map<string, Promise<HeadAncestry>>();
  const ancestry: HeadAncestryOf = (commit) => remembered(ancestries, commit, () => headAncestryOf(gitOutcome, repo, commit));
  const headLine = headLineOf(repo, gitOutcome, ancestry);
  let completeness: Promise<CloneCompleteness> | undefined;
  const cloneCompleteness = () => (completeness ??= cloneCompletenessOf(git, repo));

  const markCommits = new Map<string, Promise<string | null>>();
  const markCommit = (task: Task) =>
    remembered(markCommits, task.id, async (): Promise<string | null> => {
      const reflogCommit = () => headCommitAt(new Date(reviewMark(task)));
      const recorded = commitAtMark(task, marks);
      if (recorded === undefined) return reflogCommit();
      if (task.verified === undefined) return recorded;
      return seenFromHead(await headLine(recorded)) ? recorded : reflogCommit();
    });

  const bases = new Map<string, Promise<TaskBase>>();
  const baseOf = (task: Task) =>
    remembered(bases, task.id, async (): Promise<TaskBase> => {
      const since = new Date(reviewMark(task));
      const noCommitAtMark = async (): Promise<TaskBase> => ({ kind: "approximate", since, markLine: (await cloneCompleteness()) === "full" ? "this-line" : "unknown" });
      const commit = await markCommit(task);
      if (commit === null) return noCommitAtMark();
      const line = await headLine(commit);
      switch (line) {
        case "this-line":
          return { kind: "exact", commit };
        case "other-branch":
          return { kind: "approximate", since, markLine: line };
        case "missing":
          return noCommitAtMark();
        case "unknown":
          return { kind: "unknown" };
      }
    });

  const diffSinceBase = async (task: Task, path: string) => {
    const base = await baseOf(task);
    switch (base.kind) {
      case "exact":
        return diffFrom(path, base.commit);
      case "approximate":
        return diffSince(path, base.since);
      case "unknown":
        return null;
    }
  };

  return { markCommit, baseOf, diffSinceBase, diffFrom, ancestry, cloneCompleteness };
}

export function markLineOf(base: TaskBase): MarkLine {
  switch (base.kind) {
    case "exact":
      return "this-line";
    case "approximate":
      return base.markLine;
    case "unknown":
      return "unknown";
  }
}

function seenFromHead(line: HeadLine): boolean {
  switch (line) {
    case "this-line":
    case "unknown":
      return true;
    case "other-branch":
    case "missing":
      return false;
  }
}
