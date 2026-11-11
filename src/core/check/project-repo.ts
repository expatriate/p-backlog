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
import { branchHistoryOf, locateRepo, pathsEverCommitted } from "./repo-facts";

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

export type RepoChoice = { path: string; settled: boolean };

type CheckoutTasks = { checkout: ProjectCheckout; tasks: Task[]; unsettled: ReadonlySet<string> };

type SourceChoice = { checkout: ProjectCheckout; settled: boolean };

type OwnedSource = AnchoredTask & { ownerCommit?: string | undefined };

type PathTrace = "committed" | "unknown" | "none";

type SourceEvidence = { onDisk: readonly ProjectCheckout[]; owner: ProjectCheckout | undefined; traceIn: (checkout: ProjectCheckout) => PathTrace };

export async function projectCheckouts(project: Project, { workingRoots, ...context }: RepoLookup): Promise<ProjectCheckout[]> {
  const repos = await existingRepos(project, context);
  const cwdRepo = workingRoots === null ? undefined : repos.find((repo) => realpathOrNull(repo) === workingRoots.main);
  const others = repos.filter((repo) => repo !== cwdRepo).map((path) => ({ path, linkedWorktree: false, holdsCwd: false }));
  if (cwdRepo === undefined || workingRoots === null) return others;
  return [{ path: workingRoots.worktree, linkedWorktree: workingRoots.worktree !== workingRoots.main, holdsCwd: true }, ...others];
}

export async function explicitSourceRepo(project: Project, lookup: RepoLookup, source: string): Promise<RepoChoice | undefined> {
  const [choice] = await sourceChoices(await projectCheckouts(project, lookup), [{ source }]);
  return choice === undefined ? undefined : { path: choice.checkout.path, settled: choice.settled || choice.checkout.holdsCwd };
}

export async function taskRepo(project: Project, lookup: RepoLookup, task: Task, marks: MarkCommits): Promise<RepoChoice | undefined> {
  const [choice] = await sourceChoices(await projectCheckouts(project, lookup), [ownedSource(task, marks)]);
  return choice === undefined ? undefined : { path: choice.checkout.path, settled: choice.settled };
}

export async function tasksByCheckout(checkouts: readonly ProjectCheckout[], tasks: readonly Task[], marks: MarkCommits): Promise<CheckoutTasks[]> {
  const choices = await sourceChoices(
    checkouts,
    tasks.map((task) => ownedSource(task, marks)),
  );
  const chosen = tasks.map((task, index) => ({ task, choice: choices[index] }));
  return checkouts.flatMap((checkout) => {
    const own = chosen.filter(({ choice }) => choice?.checkout === checkout);
    const unsettled = new Set(own.filter(({ choice }) => choice?.settled === false).map(({ task }) => task.id));
    return own.length === 0 ? [] : [{ checkout, tasks: own.map(({ task }) => task), unsettled }];
  });
}

function ownedSource(task: Task, marks: MarkCommits): OwnedSource {
  return { source: task.source, anchor: task.anchor, ownerCommit: commitAtMark(task, marks) ?? marks.origins.get(task.id)?.commit };
}

async function sourceChoices(checkouts: readonly ProjectCheckout[], tasks: readonly OwnedSource[]): Promise<(SourceChoice | undefined)[]> {
  const [first] = checkouts;
  if (first === undefined) return tasks.map(() => undefined);
  if (checkouts.length === 1) return tasks.map(() => ({ checkout: first, settled: true }));
  const [onDisk, ownerOf] = await Promise.all([Promise.all(tasks.map((task) => checkoutsWithSource(checkouts, task.source))), ownerCheckouts(checkouts, tasks)]);
  const asked = tasks.flatMap((task, index) => historyQuestions(checkouts, task, onDisk[index] ?? [], ownerOf(task)));
  const traceOf = await pathTraces(checkouts, asked);
  return Promise.all(
    tasks.map((task, index) => {
      const path = task.source === undefined ? undefined : sourcePath(task.source);
      const evidence = { onDisk: onDisk[index] ?? [], owner: ownerOf(task), traceIn: (checkout: ProjectCheckout) => (path === undefined ? "none" : traceOf(checkout, path)) };
      return sourceChoice(checkouts, first, task, evidence);
    }),
  );
}

async function sourceChoice(checkouts: readonly ProjectCheckout[], first: ProjectCheckout, task: OwnedSource, { onDisk, owner, traceIn }: SourceEvidence): Promise<SourceChoice> {
  if (task.source === undefined) return { checkout: first, settled: true };
  if (owner !== undefined && (onDisk.includes(owner) || traceIn(owner) !== "none")) return { checkout: owner, settled: true };
  const [preferred] = onDisk;
  if (preferred !== undefined) return anchoredChoice(preferred, onDisk, sourcePath(task.source), task);
  const committed = checkouts.filter((checkout) => traceIn(checkout) === "committed");
  const traced = committed.length > 0 ? committed : checkouts.filter((checkout) => traceIn(checkout) === "unknown");
  return { checkout: traced[0] ?? first, settled: traced.length <= 1 };
}

async function anchoredChoice(preferred: ProjectCheckout, onDisk: readonly ProjectCheckout[], path: string, task: AnchoredTask): Promise<SourceChoice> {
  if (onDisk.length === 1 || task.anchor === undefined) return { checkout: preferred, settled: onDisk.length === 1 };
  const texts = await Promise.all(onDisk.map((checkout) => attemptReportingFailure(join(checkout.path, path), readTextIfFile, unreadableIsLeftToReview)));
  const anchored = onDisk.filter((_, index) => anchorHolds(task, texts[index] ?? null));
  return { checkout: anchored[0] ?? preferred, settled: anchored.length === 1 };
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

function historyQuestions(checkouts: readonly ProjectCheckout[], task: OwnedSource, onDisk: readonly ProjectCheckout[], owner: ProjectCheckout | undefined): [ProjectCheckout, string][] {
  if (task.source === undefined) return [];
  const path = sourcePath(task.source);
  if (onDisk.length === 0) return checkouts.map((checkout) => [checkout, path]);
  return owner === undefined || onDisk.includes(owner) ? [] : [[owner, path]];
}

async function pathTraces(checkouts: readonly ProjectCheckout[], asked: readonly [ProjectCheckout, string][]): Promise<(checkout: ProjectCheckout, path: string) => PathTrace> {
  const histories = await Promise.all(
    checkouts.map(async (checkout) => {
      const paths = [...new Set(asked.flatMap(([asker, path]) => (asker === checkout ? [path] : [])))];
      return paths.length === 0 ? null : pathsEverCommitted(checkout.path, paths);
    }),
  );
  return (checkout, path) => {
    const history = histories[checkouts.indexOf(checkout)];
    switch (history?.kind) {
      case undefined:
      case "no-repo":
        return "none";
      case "unreadable":
        return "unknown";
      case "read":
        return committedIn(history.committed, path) ? "committed" : "none";
    }
  };
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
