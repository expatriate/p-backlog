import type { Task } from "../model/types";
import { anchorOf, relocatedSource } from "./anchor";
import { changesSince, reviewMark } from "./candidates";
import { baseText, currentLine } from "./diff-hunks";
import { collectRepoFacts, diffsSince, type DiffSince, type RepoFacts } from "./repo-facts";
import { hasLines, sourcePath } from "./source-lines";

export type CurrentSources = ReadonlyMap<string, string | null>;

export async function currentSources(tasks: readonly Task[], facts: RepoFacts, diffOf: DiffSince): Promise<CurrentSources> {
  return new Map(await Promise.all(tasks.map(async (task) => [task.id, await currentSource(task, facts, diffOf)] as const)));
}

export async function currentSourceIn(repo: string, task: Task): Promise<string | null> {
  if (task.source === undefined) return null;
  const facts = await collectRepoFacts(repo, { since: new Date(reviewMark(task)), paths: [sourcePath(task.source)] });
  return currentSource(task, facts, diffsSince(repo));
}

async function currentSource(task: Task, facts: RepoFacts, diffOf: DiffSince): Promise<string | null> {
  const { source } = task;
  if (source === undefined || !hasLines(source)) return null;
  const path = sourcePath(source);
  const text = facts.texts.get(path);
  if (text === undefined) return null;
  const mark = reviewMark(task);
  const { commits, uncommitted } = changesSince(facts, path, mark);
  if (commits.length === 0 && !uncommitted) return source;
  const hunks = (await diffOf(path, new Date(mark)))?.hunks ?? null;
  if (hunks === null) return null;
  const current = relocatedSource(source, (line) => currentLine(hunks, line));
  if (current === null || anchorOf(text, current) === null) return null;
  if (task.anchor === undefined) return current === source ? source : null;
  return anchorOf(baseText(hunks, text), source) === task.anchor ? current : null;
}
