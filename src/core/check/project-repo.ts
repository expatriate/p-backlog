import { join } from "node:path";
import type { PathErrorHandler } from "../errors";
import { resolveCommits, runGit } from "../git/run";
import type { Project, Task } from "../model/types";
import { fileExists, attemptReportingFailure, readTextIfFile, realpathOrNull } from "../store/fs-utils";
import { expandHome } from "../store/paths";
import type { GitRoots, RepoContext } from "../store/resolve-project";
import { anchorOf } from "./anchor";
import { sourcePath } from "../model/source";
import { anchorHolds, committedIn, presenceOffDisk, type AnchoredTask, type PresenceOffDisk } from "./candidates";
import { currentSourceIn } from "./current-source";
import { commitAtMark, type MarkCommits } from "./reviewed-task";
import { branchHistoryOf, locateRepo, pathsEverCommitted, type EverCommitted, type KnownHistory } from "./repo-facts";

export type SourcePresence = { kind: PresenceOffDisk } | { kind: "unsafe-repo"; trustCommand: string };

export type SourceAnchor = { kind: "no-file" } | { kind: "uncomputable" } | { kind: "anchor"; anchor: string };

export type RepoLookup = RepoContext & { workingRoots: GitRoots | null };

export async function sourceAnchor(repo: string | undefined, source: string, onUnreadable: PathErrorHandler): Promise<SourceAnchor> {
  const text = repo === undefined ? null : await attemptReportingFailure(join(repo, sourcePath(source)), readTextIfFile, onUnreadable);
  if (text === null) return { kind: "no-file" };
  const anchor = anchorOf(text, source);
  return anchor === null ? { kind: "uncomputable" } : { kind: "anchor", anchor };
}

export async function sourcePresence(repo: string, source: string, onUnreadable: PathErrorHandler): Promise<SourcePresence> {
  const path = sourcePath(source);
  const onDisk = await attemptReportingFailure(join(repo, path), fileExists, onUnreadable);
  const presentOrUnreadable = onDisk !== false;
  if (presentOrUnreadable) return { kind: "present" };
  const location = await locateRepo(repo);
  if (location.history === "unsafe-repo") return { kind: "unsafe-repo", trustCommand: location.trustCommand };
  return { kind: presenceOffDisk(path, await branchHistoryOf(repo, location, [path])) };
}

export async function relocatedSource(repo: string | undefined, task: Task): Promise<string | undefined> {
  const current = repo === undefined ? null : await currentSourceIn(repo, task);
  return current === null || current === task.source ? undefined : current;
}

export type ProjectCheckout = { path: string; linkedWorktree: boolean; holdsCwd: boolean };

export type RepoChoice = { path: string; recordIn: string | undefined };

type CheckoutTasks = { checkout: ProjectCheckout; tasks: Task[]; unsettled: ReadonlySet<string>; history: KnownHistory | undefined };

type SourceChoice = { checkout: ProjectCheckout; settled: boolean };

type OwnedSource = AnchoredTask & { ownerCommit?: string | undefined };

type PathTrace = "committed" | "unknown" | "none";

type Histories = ReadonlyMap<ProjectCheckout, KnownHistory>;

type SourceEvidence = { onDisk: readonly ProjectCheckout[]; owner: ProjectCheckout | undefined; traceIn: (checkout: ProjectCheckout) => PathTrace };

type ProjectChoices = { choices: (SourceChoice | undefined)[]; histories: Histories };

export async function projectCheckouts(project: Project, { workingRoots, ...context }: RepoLookup): Promise<ProjectCheckout[]> {
  const repos = await existingRepos(project, context);
  const cwdRepo = workingRoots === null ? undefined : repos.find((repo) => realpathOrNull(repo) === workingRoots.main);
  const others = repos.filter((repo) => repo !== cwdRepo).map((path) => ({ path, linkedWorktree: false, holdsCwd: false }));
  if (cwdRepo === undefined || workingRoots === null) return others;
  return [{ path: workingRoots.worktree, linkedWorktree: workingRoots.worktree !== workingRoots.main, holdsCwd: true }, ...others];
}

export async function explicitSourceRepo(project: Project, lookup: RepoLookup, source: string): Promise<RepoChoice | undefined> {
  const [choice] = (await sourceChoices(await projectCheckouts(project, lookup), [{ source }])).choices;
  return choice === undefined ? undefined : repoChoice(choice.checkout, choice.settled || choice.checkout.holdsCwd);
}

export async function taskRepo(project: Project, lookup: RepoLookup, task: Task, marks: MarkCommits): Promise<RepoChoice | undefined> {
  const [choice] = (await sourceChoices(await projectCheckouts(project, lookup), [ownedSource(task, marks)])).choices;
  return choice === undefined ? undefined : repoChoice(choice.checkout, choice.settled);
}

export async function tasksByCheckout(checkouts: readonly ProjectCheckout[], tasks: readonly Task[], marks: MarkCommits): Promise<CheckoutTasks[]> {
  const { choices, histories } = await sourceChoices(
    checkouts,
    tasks.map((task) => ownedSource(task, marks)),
  );
  const chosen = tasks.map((task, index) => ({ task, choice: choices[index] }));
  return checkouts.flatMap((checkout) => {
    const own = chosen.filter(({ choice }) => choice?.checkout === checkout);
    const unsettled = new Set(own.filter(({ choice }) => choice?.settled === false).map(({ task }) => task.id));
    return own.length === 0 ? [] : [{ checkout, tasks: own.map(({ task }) => task), unsettled, history: histories.get(checkout) }];
  });
}

function repoChoice({ path }: ProjectCheckout, recordable: boolean): RepoChoice {
  return { path, recordIn: recordable ? path : undefined };
}

function ownedSource(task: Task, marks: MarkCommits): OwnedSource {
  return { source: task.source, anchor: task.anchor, ownerCommit: commitAtMark(task, marks) ?? marks.origins.get(task.id)?.commit };
}

async function sourceChoices(checkouts: readonly ProjectCheckout[], tasks: readonly OwnedSource[]): Promise<ProjectChoices> {
  const [first] = checkouts;
  if (first === undefined) return { choices: tasks.map(() => undefined), histories: new Map() };
  if (checkouts.length === 1) return { choices: tasks.map(() => ({ checkout: first, settled: true })), histories: new Map() };
  const [onDisk, ownerOf] = await Promise.all([Promise.all(tasks.map((task) => checkoutsWithSource(checkouts, task.source))), ownerCheckouts(checkouts, tasks)]);
  const ownerHistories = await askHistories(
    checkouts,
    tasks.flatMap((task, index) => ownerQuestion(task, onDisk[index] ?? [], ownerOf(task))),
  );
  const otherHistories = await askHistories(
    checkouts,
    tasks.flatMap((task, index) => otherQuestions(checkouts, task, onDisk[index] ?? [], ownerOf(task), ownerHistories)),
  );
  const histories = mergedHistories(ownerHistories, otherHistories);
  const choices = await Promise.all(
    tasks.map((task, index) => {
      const path = task.source === undefined ? undefined : sourcePath(task.source);
      const traceIn = (checkout: ProjectCheckout) => (path === undefined ? "none" : traceOf(histories, checkout, path));
      return sourceChoice(checkouts, first, task, { onDisk: onDisk[index] ?? [], owner: ownerOf(task), traceIn });
    }),
  );
  return { choices, histories };
}

async function sourceChoice(checkouts: readonly ProjectCheckout[], first: ProjectCheckout, task: OwnedSource, evidence: SourceEvidence): Promise<SourceChoice> {
  if (task.source === undefined) return { checkout: first, settled: true };
  const path = sourcePath(task.source);
  const { onDisk, owner, traceIn } = evidence;
  if (owner !== undefined && onDisk.includes(owner)) return { checkout: owner, settled: true };
  if (owner !== undefined && traceIn(owner) !== "none") return ownerWithoutFile(owner, path, task, evidence);
  const [preferred] = onDisk;
  if (preferred !== undefined) return anchoredChoice(preferred, onDisk, path, task);
  const committed = checkouts.filter((checkout) => traceIn(checkout) === "committed");
  if (committed[0] !== undefined) return { checkout: committed[0], settled: committed.length === 1 };
  const unknown = checkouts.filter((checkout) => traceIn(checkout) === "unknown");
  return { checkout: unknown[0] ?? first, settled: unknown.length === 0 };
}

async function ownerWithoutFile(owner: ProjectCheckout, path: string, task: AnchoredTask, { onDisk, traceIn }: SourceEvidence): Promise<SourceChoice> {
  if (onDisk.length === 0) return { checkout: owner, settled: traceIn(owner) === "committed" };
  const anchored = await anchoredIn(onDisk, path, task);
  return anchored.length === 1 && anchored[0] !== undefined ? { checkout: anchored[0], settled: true } : { checkout: owner, settled: false };
}

async function anchoredChoice(preferred: ProjectCheckout, onDisk: readonly ProjectCheckout[], path: string, task: AnchoredTask): Promise<SourceChoice> {
  if (onDisk.length === 1) return { checkout: preferred, settled: true };
  const anchored = await anchoredIn(onDisk, path, task);
  return { checkout: anchored[0] ?? preferred, settled: anchored.length === 1 };
}

async function anchoredIn(onDisk: readonly ProjectCheckout[], path: string, task: AnchoredTask): Promise<ProjectCheckout[]> {
  if (task.anchor === undefined) return [];
  const texts = await Promise.all(onDisk.map((checkout) => attemptReportingFailure(join(checkout.path, path), readTextIfFile, unreadableIsLeftToReview)));
  return onDisk.filter((_, index) => anchorHolds(task, texts[index] ?? null));
}

async function checkoutsWithSource(checkouts: readonly ProjectCheckout[], source: string | undefined): Promise<ProjectCheckout[]> {
  if (source === undefined) return [];
  const path = sourcePath(source);
  const onDisk = await Promise.all(checkouts.map((checkout) => attemptReportingFailure(join(checkout.path, path), fileExists, unreadableIsLeftToReview)));
  return checkouts.filter((_, index) => onDisk[index] !== false);
}

async function ownerCheckouts(checkouts: readonly ProjectCheckout[], tasks: readonly OwnedSource[]): Promise<(task: OwnedSource) => ProjectCheckout | undefined> {
  const commits = [...new Set(tasks.flatMap((task) => (task.source === undefined || task.ownerCommit === undefined ? [] : [task.ownerCommit])))];
  const found = commits.length === 0 ? [] : await Promise.all(checkouts.map((checkout) => resolveCommits(runGit, checkout.path, commits)));
  return ({ ownerCommit }) => {
    if (ownerCommit === undefined) return undefined;
    const holders = checkouts.filter((_, index) => found[index]?.has(ownerCommit) === true);
    return holders.length === 1 ? holders[0] : undefined;
  };
}

function ownerQuestion(task: OwnedSource, onDisk: readonly ProjectCheckout[], owner: ProjectCheckout | undefined): [ProjectCheckout, string][] {
  return task.source === undefined || owner === undefined || onDisk.includes(owner) ? [] : [[owner, sourcePath(task.source)]];
}

function otherQuestions(
  checkouts: readonly ProjectCheckout[],
  task: OwnedSource,
  onDisk: readonly ProjectCheckout[],
  owner: ProjectCheckout | undefined,
  ownerHistories: Histories,
): [ProjectCheckout, string][] {
  if (task.source === undefined || onDisk.length > 0) return [];
  const path = sourcePath(task.source);
  if (owner !== undefined && traceOf(ownerHistories, owner, path) !== "none") return [];
  return checkouts.filter((checkout) => checkout !== owner).map((checkout) => [checkout, path]);
}

async function askHistories(checkouts: readonly ProjectCheckout[], asked: readonly [ProjectCheckout, string][]): Promise<Map<ProjectCheckout, KnownHistory>> {
  const answers = await Promise.all(
    checkouts.map(async (checkout): Promise<[ProjectCheckout, KnownHistory][]> => {
      const paths = new Set(asked.flatMap(([asker, path]) => (asker === checkout ? [path] : [])));
      return paths.size === 0 ? [] : [[checkout, { paths, anywhere: await pathsEverCommitted(checkout.path, [...paths]) }]];
    }),
  );
  return new Map(answers.flat());
}

function mergedHistories(first: Histories, second: Histories): Histories {
  const merged = new Map(first);
  for (const [checkout, known] of second) {
    const earlier = merged.get(checkout);
    merged.set(checkout, earlier === undefined ? known : { paths: new Set([...earlier.paths, ...known.paths]), anywhere: combinedAnswer(earlier.anywhere, known.anywhere) });
  }
  return merged;
}

function combinedAnswer(one: EverCommitted, other: EverCommitted): EverCommitted {
  if (one.kind !== "read") return one;
  if (other.kind !== "read") return other;
  return { kind: "read", committed: new Set([...one.committed, ...other.committed]) };
}

function traceOf(histories: Histories, checkout: ProjectCheckout, path: string): PathTrace {
  const known = histories.get(checkout);
  if (known?.paths.has(path) !== true) return "none";
  switch (known.anywhere.kind) {
    case "no-repo":
      return "none";
    case "unreadable":
      return "unknown";
    case "read":
      return committedIn(known.anywhere.committed, path) ? "committed" : "none";
  }
}

function unreadableIsLeftToReview(): void {}

async function existingRepos(project: Project, { home, onUnreadable }: RepoContext): Promise<string[]> {
  const repos = project.repos.map((path) => expandHome(path, home));
  const exists = await Promise.all(repos.map((repo) => attemptReportingFailure(repo, fileExists, onUnreadable)));
  return repos.filter((_, index) => exists[index] === true);
}

export async function hasCommit(repo: string, sha: string): Promise<boolean> {
  return (await runGit(repo, ["cat-file", "-e", `${sha}^{commit}`])) !== null;
}
