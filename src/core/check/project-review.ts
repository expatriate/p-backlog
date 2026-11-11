import { join } from "node:path";
import type { PathErrorHandler } from "../errors";
import { openCodeGraph, type CodeGraph } from "../code-review-graph/graph-db";
import type { CandidateEvidence, CheckMode, FilteredSighting, TaskEvidence } from "../journal/events";
import type { Project, Task } from "../model/types";
import { attemptReportingFailure, readTextIfFile } from "../store/fs-utils";
import { readJournal } from "../store/journal";
import { asGitRunner, runGitOutcome, type GitOutcomeRunner } from "../git/run";
import { codeStateOf, snippetOf } from "./anchor";
import { commitsKnownAtMark } from "./known-commits";
import { commitsArrivedLate } from "./late-commits";
import {
  anchorStates,
  codeReview,
  judgedByCommits,
  relocationPlan,
  renamePlan,
  type AnchorPlan,
  type AnchorStates,
  type Candidate,
  type ChangeContext,
  type CodeReview,
  type ReportedCandidate,
} from "./candidates";
import { isReviewable, markCommitsIn, reviewMark, type MarkCommits } from "./reviewed-task";
import { duplicateCandidates } from "./duplicates";
import { currentSourcesOf, repoDiffs, traceSources, type LineAtMark, type SourceTraces } from "./current-source";
import type { CheckProblem } from "./findings";
import { awaitingMerge } from "./awaiting-merge";
import { collectRepoFacts, headLineOf, type DiffExcerpt, type HeadLine, type HeadLineOf, type RepoFacts } from "./repo-facts";
import { sourcePath } from "../model/source";
import { tasksByCheckout, type ProjectCheckout } from "./project-repo";
import type { LateCommits } from "./source-commits";
import { fileHashes, filterBySymbol, symbolLookup, symbolNames, type SymbolFilterContext, type SymbolFilterResult } from "./symbol-filter";

const PROBLEM_LIMIT = 400;

export type ProjectReview = {
  projectId: string;
  candidates: ReportedCandidate[];
  filtered: FilteredSighting[];
  plans: AnchorPlan[];
  problems: CheckProblem[];
  unchecked: TaskEvidence[];
  awaitingMerge: string[];
  skipped: string[];
};

export type ReviewScope = { checkouts: readonly ProjectCheckout[]; marks: MarkCommits; mode: CheckMode; onUnreadable: PathErrorHandler; git?: GitOutcomeRunner | undefined };

type RepoReviewScope = Pick<ReviewScope, "marks" | "mode" | "onUnreadable"> & { repo: string; git: GitOutcomeRunner };

type RepoReview = Omit<ProjectReview, "projectId"> & { symbols: ReadonlyMap<string, string | null> };

type ProjectContext = SymbolFilterContext & { facts: RepoFacts; traces: SourceTraces; lineAtMark: LineAtMark };

type SymbolSightings = SymbolFilterResult & { plans: AnchorPlan[] };

type LineJudgement = { kept: Candidate[]; linesIntact: string[]; notOnBranch: string[] };

type PlanSettlement = { untouchable: ReadonlySet<string>; relocatable: readonly string[] };

type RepoScope = RepoReviewScope & { facts: RepoFacts; late: LateCommits; graph: CodeGraph | null; headLine: HeadLineOf };

type MergeScope = Pick<RepoScope, "repo" | "marks" | "git"> & { projectId: string };

type MergeJudgement = Pick<ProjectReview, "candidates" | "filtered" | "plans" | "awaitingMerge" | "problems">;

export async function readMarkCommits(root: string, projectId: string, onJournalUnreadable: (error: unknown) => void): Promise<MarkCommits> {
  const journal = await readJournal(join(root, projectId), projectId).catch((error: unknown) => {
    onJournalUnreadable(error);
    return null;
  });
  return markCommitsIn(journal?.events ?? []);
}

export async function projectReview(project: Project, allTasks: readonly Task[], { checkouts, git = runGitOutcome, ...scope }: ReviewScope): Promise<ProjectReview> {
  const tasks = allTasks.filter((task) => task.projectId === project.id && isReviewable(task));
  const nothing = { projectId: project.id, candidates: [], filtered: [], plans: [], problems: [], unchecked: [], awaitingMerge: [], skipped: [] };
  if (tasks.length === 0) return nothing;
  if (checkouts.length === 0)
    return { ...nothing, candidates: scope.mode === "full" ? duplicateCandidates(tasks) : [], unchecked: [...evidenceOf(tasks, "source-changed"), ...evidenceOf(tasks, "source-missing")] };

  const reviews = await Promise.all(
    (await tasksByCheckout(checkouts, tasks, scope.marks)).map(async ({ checkout, tasks: own, unsettled }) => {
      const review = await repoReview(project, own, { ...scope, repo: checkout.path, git });
      return { ...review, plans: checkout.linkedWorktree ? [] : review.plans.filter((plan) => !unsettled.has(plan.id)) };
    }),
  );
  const skipped = new Set(reviews.flatMap((review) => review.skipped));
  const symbols = new Map(reviews.flatMap((review) => [...review.symbols]));
  const duplicates = scope.mode === "full" ? duplicateCandidates(tasks, (task) => symbols.get(task.id) ?? null).filter((candidate) => !skipped.has(candidate.task.id)) : [];
  return {
    projectId: project.id,
    candidates: [...reviews.flatMap((review) => review.candidates), ...duplicates],
    filtered: reviews.flatMap((review) => review.filtered),
    plans: reviews.flatMap((review) => review.plans),
    problems: reviews.flatMap((review) => review.problems),
    unchecked: reviews.flatMap((review) => review.unchecked),
    awaitingMerge: reviews.flatMap((review) => review.awaitingMerge),
    skipped: [...skipped],
  };
}

async function repoReview(project: Project, tasks: readonly Task[], scope: RepoReviewScope): Promise<RepoReview> {
  const { repo, marks, mode, onUnreadable, git } = scope;
  const facts = await collectRepoFacts(repo, earliestMarks(tasks));
  for (const [path, error] of facts.unreadable) onUnreadable(join(repo, path), error);
  const skipped = new Set(tasks.filter((task) => task.source !== undefined && facts.unreadable.has(sourcePath(task.source))).map((task) => task.id));
  const readable = tasks.filter((task) => !skipped.has(task.id));
  const graph = openCodeGraph(repo);
  try {
    const anchors = anchorStates(readable, facts);
    const question = { repo, tasks: readable, facts, anchors, marks };
    const knownCommits = await commitsKnownAtMark({ ...question, git: asGitRunner(git) });
    const headLine = headLineOf(repo, git);
    const { late, unknown: lateUnknown } = await commitsArrivedLate({ ...question, knownCommits, git, headLine });
    const repoScope: RepoScope = { ...scope, facts, late, graph, headLine };
    const review = await withRenamesFollowed(codeReview(readable, { facts, late }, knownCommits, anchors), readable, repoScope);
    const context = await projectContext(readable, review, repoScope);
    const sighted = await sightedBySymbol(review, context);
    const { problems: mergeProblems, ...judged } = await judgedAgainstMerges(sighted, context, { repo, marks, projectId: project.id, git });
    return {
      ...judged,
      skipped: [...skipped],
      problems: [...historyProblems(project, repo, facts), ...mergeProblems],
      unchecked: uncheckedEvidence(tasks, anchors, facts, lateUnknown),
      symbols: mode === "full" ? repoSymbolNames(repo, readable, context) : new Map(),
    };
  } finally {
    graph?.close();
  }
}

function repoSymbolNames(repo: string, tasks: readonly Task[], { symbolAt, located }: ProjectContext): Map<string, string | null> {
  const symbolOf = symbolNames(symbolAt, located);
  return new Map(
    tasks.map((task) => {
      const name = symbolOf(task);
      return [task.id, name === null ? null : `${repo}\0${name}`];
    }),
  );
}

async function projectContext(tasks: readonly Task[], review: CodeReview, { repo, facts, late, marks, mode, onUnreadable, graph, headLine }: RepoScope): Promise<ProjectContext> {
  const diffs = repoDiffs(repo, marks, headLine);
  const symbolAt = symbolLookup(graph, fileHashes(repo, onUnreadable));
  const changedIds = new Set(review.candidates.flatMap((candidate) => (candidate.kind === "source-changed" ? [candidate.task.id] : [])));
  const locating = mode === "full" && graph !== null ? tasks : tasks.filter((task) => changedIds.has(task.id));
  const traces = await traceSources(locating, { facts, late }, diffs);
  return { tasksById: new Map(tasks.map((task) => [task.id, task])), located: currentSourcesOf(traces), traces, facts, diffOf: diffs.sinceTaskMark, lineAtMark: diffs.lineAtMark, symbolAt };
}

async function sightedBySymbol(review: CodeReview, context: ProjectContext): Promise<SymbolSightings> {
  const byLines = judgedByLines(review.candidates, context.traces);
  const { kept, filtered } = await filterBySymbol(byLines.kept, context);
  const relocatable = [...filtered.map((sighting) => sighting.task), ...byLines.linesIntact];
  const maybeOnAnotherBranch = await unanchoredMaybeOnAnotherBranch(
    review.plans.map((plan) => plan.id),
    context,
  );
  const settlement: PlanSettlement = {
    untouchable: new Set([...kept.map((candidate) => candidate.task.id), ...byLines.notOnBranch, ...maybeOnAnotherBranch]),
    relocatable,
  };
  return { kept, filtered, plans: settledPlans(review.plans, settlement, context) };
}

async function unanchoredMaybeOnAnotherBranch(ids: readonly string[], { tasksById, lineAtMark }: ProjectContext): Promise<Set<string>> {
  const unanchored = [...new Set(ids)].flatMap((id) => {
    const task = tasksById.get(id);
    return task === undefined || task.anchor !== undefined ? [] : [task];
  });
  const lines = await Promise.all(unanchored.map(async (task) => ({ id: task.id, line: await lineAtMark(task) })));
  return new Set(lines.filter(({ line }) => line !== null && firstAnchorWaits(line)).map(({ id }) => id));
}

function firstAnchorWaits(line: HeadLine): boolean {
  switch (line) {
    case "other-branch":
    case "unknown":
      return true;
    case "this-line":
    case "missing":
      return false;
  }
}

async function judgedAgainstMerges(sighted: SymbolSightings, context: ProjectContext, { repo, marks, projectId, git }: MergeScope): Promise<MergeJudgement> {
  const { pending, unknownBranches } = await awaitingMerge({ repo, taskIds: involvedTaskIds(sighted), origins: marks.origins, git });
  const judged = (id: string) => !pending.has(id);
  const code = await Promise.all(sighted.kept.filter((candidate) => judged(candidate.task.id)).map((candidate) => withContext(candidate, context)));
  return {
    candidates: code,
    filtered: sighted.filtered.filter((sighting) => judged(sighting.task)),
    plans: sighted.plans.filter((plan) => judged(plan.id)),
    awaitingMerge: [...pending],
    problems: unknownBranches.length === 0 ? [] : [{ kind: "merge-state-unknown", projectId, repo, branches: unknownBranches }],
  };
}

function judgedByLines(candidates: readonly Candidate[], traces: SourceTraces): LineJudgement {
  const judgement: LineJudgement = { kept: [], linesIntact: [], notOnBranch: [] };
  for (const candidate of candidates) {
    const trace = candidate.kind === "source-changed" && candidate.method === "anchor" ? traces.get(candidate.task.id) : undefined;
    if (trace?.kind === "not-on-branch") judgement.notOnBranch.push(candidate.task.id);
    else if (trace?.kind === "traced" && !trace.linesChanged) judgement.linesIntact.push(candidate.task.id);
    else judgement.kept.push(candidate);
  }
  return judgement;
}

async function withRenamesFollowed(review: CodeReview, tasks: readonly Task[], { repo, onUnreadable }: Pick<RepoScope, "repo" | "onUnreadable">): Promise<CodeReview> {
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const renamePlans = await Promise.all(
    review.candidates.map(async (candidate) => {
      const task = tasksById.get(candidate.task.id);
      if (candidate.kind !== "source-missing" || candidate.renamedTo === undefined || task === undefined) return null;
      const text = await attemptReportingFailure(join(repo, candidate.renamedTo), readTextIfFile, onUnreadable);
      return text === null ? null : renamePlan(task, candidate.renamedTo, text);
    }),
  );
  return {
    candidates: review.candidates.filter((_, index) => renamePlans[index] === null),
    plans: [...review.plans, ...renamePlans.filter((plan) => plan !== null)],
  };
}

function involvedTaskIds({ kept, filtered, plans }: SymbolSightings): string[] {
  return [...new Set([...kept.map((candidate) => candidate.task.id), ...filtered.map((sighting) => sighting.task), ...plans.map((plan) => plan.id)])];
}

function uncheckedEvidence(tasks: readonly Task[], anchors: AnchorStates, { history, branches, existing }: RepoFacts, lateUnknown: ReadonlySet<string>): TaskEvidence[] {
  const changeUnchecked = tasks.filter((task) => (history === "read" ? lateUnknown.has(task.id) : judgedByCommits(task, anchors)));
  const missingUnchecked = branches.kind === "unreadable" ? tasks.filter((task) => task.source !== undefined && !existing.has(sourcePath(task.source))) : [];
  return [...evidenceOf(changeUnchecked, "source-changed"), ...evidenceOf(missingUnchecked, "source-missing")];
}

function evidenceOf(tasks: readonly Task[], evidence: CandidateEvidence): TaskEvidence[] {
  return tasks.map((task) => ({ task: task.id, evidence }));
}

function historyProblems(project: Project, repo: string, facts: RepoFacts): CheckProblem[] {
  switch (facts.history) {
    case "read":
      return facts.branches.kind === "unreadable" ? [{ kind: "project-branches-unreadable", projectId: project.id, repo }] : [];
    case "not-a-repo":
      return [{ kind: "project-repo-not-git", projectId: project.id, repo }];
    case "unsafe-repo":
      return [{ kind: "project-repo-unsafe", projectId: project.id, repo, trustCommand: facts.trustCommand }];
    case "unreadable":
      return [{ kind: "project-history-unreadable", projectId: project.id, repo }];
  }
}

function earliestMarks(tasks: readonly Task[]): Map<string, number> {
  const marks = new Map<string, number>();
  for (const task of tasks) {
    if (task.source === undefined) continue;
    const path = sourcePath(task.source);
    marks.set(path, Math.min(marks.get(path) ?? Number.POSITIVE_INFINITY, reviewMark(task)));
  }
  return marks;
}

function settledPlans(plans: readonly AnchorPlan[], { untouchable, relocatable }: PlanSettlement, { tasksById, located, facts }: ProjectContext): AnchorPlan[] {
  const relocations = new Map(
    relocatable.flatMap((id): [string, AnchorPlan][] => {
      const task = tasksById.get(id);
      const current = located.get(id);
      const plan = task === undefined || current === null || current === undefined ? null : relocationPlan(task, current, facts);
      return plan === null ? [] : [[id, plan]];
    }),
  );
  return [...plans.filter((plan) => !untouchable.has(plan.id) && !relocations.has(plan.id)), ...relocations.values()];
}

async function withContext(candidate: Candidate, { tasksById, located, facts, diffOf }: ProjectContext): Promise<ReportedCandidate> {
  if (candidate.kind !== "source-changed") return candidate;
  const task = tasksById.get(candidate.task.id);
  if (task === undefined) return candidate;
  const text = facts.texts.get(candidate.path);
  const current = located.get(task.id) ?? undefined;
  const source = current ?? task.source;
  const snippet = text === undefined || source === undefined ? undefined : snippetOf(text, source);
  const codeState = text === undefined || source === undefined ? undefined : codeStateOf(text, source);
  const excerpt = (await diffOf(task, candidate.path))?.excerpt;
  const problem = firstParagraph(task.body);
  const moved = current === undefined || current === task.source ? {} : { source: current };
  const code = { ...(snippet === undefined ? {} : { snippet }), ...(codeState === undefined ? {} : { codeState }) };
  return { ...candidate, ...moved, ...(problem === undefined ? {} : { problem }), ...code, ...diffFields(excerpt) };
}

function diffFields(excerpt: DiffExcerpt | undefined): Pick<ChangeContext, "diff" | "diffOmittedLines"> {
  if (excerpt === undefined) return {};
  return excerpt.omittedLines === 0 ? { diff: excerpt.text } : { diff: excerpt.text, diffOmittedLines: excerpt.omittedLines };
}

function firstParagraph(body: string): string | undefined {
  const paragraph =
    body
      .trim()
      .split(/\n\s*\n/)[0]
      ?.trim() ?? "";
  if (paragraph === "") return undefined;
  return paragraph.length <= PROBLEM_LIMIT ? paragraph : `${paragraph.slice(0, PROBLEM_LIMIT)}…`;
}
