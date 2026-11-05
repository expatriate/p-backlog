import { join } from "node:path";
import type { PathErrorHandler } from "../errors";
import { openCodeGraph, type CodeGraph } from "../code-review-graph/graph-db";
import type { CandidateEvidence, CheckMode, FilteredSighting, TaskEvidence, TaskOrigin } from "../journal/events";
import type { Project, Task } from "../model/types";
import { attemptReportingFailure, readTextIfFile } from "../store/fs-utils";
import { readJournal } from "../store/journal";
import { snippetOf } from "./anchor";
import { commitsKnownAtCreation } from "./known-commits";
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
import { isReviewable, reviewMark } from "./reviewed-task";
import { duplicateCandidates } from "./duplicates";
import { currentSourcesOf, repoDiffs, traceSources, type SourceTraces } from "./current-source";
import type { CheckProblem } from "./findings";
import { awaitingMerge } from "./awaiting-merge";
import { collectRepoFacts, type DiffExcerpt, type RepoFacts } from "./repo-facts";
import { sourcePath } from "../model/source";
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

export type ReviewScope = { repo: string | undefined; origins: ReadonlyMap<string, TaskOrigin>; mode: CheckMode; onUnreadable: PathErrorHandler };

type ProjectContext = SymbolFilterContext & { facts: RepoFacts; traces: SourceTraces };

type SymbolSightings = SymbolFilterResult & { plans: AnchorPlan[]; duplicates: Candidate[] };

type LineJudgement = { kept: Candidate[]; linesIntact: string[]; notOnBranch: string[] };

type PlanSettlement = { untouchable: ReadonlySet<string>; relocatable: readonly string[] };

type RepoScope = ReviewScope & { repo: string; facts: RepoFacts; projectId: string; skipped: ReadonlySet<string>; graph: CodeGraph | null };

type MergeJudgement = Pick<ProjectReview, "candidates" | "filtered" | "plans" | "awaitingMerge" | "problems">;

export async function creationOrigins(root: string, projectId: string, onJournalUnreadable: (error: unknown) => void): Promise<Map<string, TaskOrigin>> {
  const journal = await readJournal(join(root, projectId), projectId).catch((error: unknown) => {
    onJournalUnreadable(error);
    return null;
  });
  return new Map((journal?.events ?? []).flatMap((event) => (event.kind === "created" && event.origin !== undefined ? [[event.task, event.origin] as const] : [])));
}

export async function projectReview(project: Project, allTasks: readonly Task[], { repo, origins, mode, onUnreadable }: ReviewScope): Promise<ProjectReview> {
  const tasks = allTasks.filter((task) => task.projectId === project.id && isReviewable(task));
  const nothing = { projectId: project.id, candidates: [], filtered: [], plans: [], problems: [], unchecked: [], awaitingMerge: [], skipped: [] };
  if (tasks.length === 0) return nothing;
  if (repo === undefined) return { ...nothing, candidates: mode === "full" ? duplicateCandidates(tasks) : [], unchecked: [...evidenceOf(tasks, "source-changed"), ...evidenceOf(tasks, "source-missing")] };

  const facts = await collectRepoFacts(repo, earliestMarks(tasks));
  for (const [path, error] of facts.unreadable) onUnreadable(join(repo, path), error);
  const skipped = new Set(tasks.filter((task) => task.source !== undefined && facts.unreadable.has(sourcePath(task.source))).map((task) => task.id));
  const readable = tasks.filter((task) => !skipped.has(task.id));
  const graph = openCodeGraph(repo);
  try {
    const scope: RepoScope = { repo, facts, origins, mode, onUnreadable, projectId: project.id, skipped, graph };
    const anchors = anchorStates(readable, facts);
    const review = await reviewedCode(readable, anchors, scope);
    const context = await projectContext(readable, review, scope);
    const sighted = await sightedBySymbol(tasks, review, context, scope);
    const { problems: mergeProblems, ...judged } = await judgedAgainstMerges(sighted, context, scope);
    return { projectId: project.id, ...judged, skipped: [...skipped], problems: [...historyProblems(project, repo, facts), ...mergeProblems], unchecked: uncheckedEvidence(tasks, anchors, facts) };
  } finally {
    graph?.close();
  }
}

async function reviewedCode(tasks: readonly Task[], anchors: AnchorStates, scope: RepoScope): Promise<CodeReview> {
  const { repo, facts, origins } = scope;
  const knownCommits = await commitsKnownAtCreation({ repo, tasks, facts, anchors, origins });
  return withRenamesFollowed(codeReview(tasks, facts, knownCommits, anchors), tasks, scope);
}

async function projectContext(tasks: readonly Task[], review: CodeReview, { repo, facts, origins, mode, onUnreadable, graph }: RepoScope): Promise<ProjectContext> {
  const diffs = repoDiffs(repo, origins);
  const symbolAt = symbolLookup(graph, fileHashes(repo, onUnreadable));
  const changedIds = new Set(review.candidates.flatMap((candidate) => (candidate.kind === "source-changed" ? [candidate.task.id] : [])));
  const locating = mode === "full" && graph !== null ? tasks : tasks.filter((task) => changedIds.has(task.id));
  const traces = await traceSources(locating, facts, diffs);
  return { tasksById: new Map(tasks.map((task) => [task.id, task])), located: currentSourcesOf(traces), traces, facts, diffOf: diffs.sinceTaskMark, symbolAt };
}

async function sightedBySymbol(tasks: readonly Task[], review: CodeReview, context: ProjectContext, { mode, skipped }: RepoScope): Promise<SymbolSightings> {
  const duplicates = mode === "full" ? duplicateCandidates(tasks, symbolNames(context.symbolAt, context.located)).filter((candidate) => !skipped.has(candidate.task.id)) : [];
  const byLines = judgedByLines(review.candidates, context.traces);
  const { kept, filtered } = await filterBySymbol(byLines.kept, context);
  const settlement: PlanSettlement = {
    untouchable: new Set([...kept.map((candidate) => candidate.task.id), ...byLines.notOnBranch]),
    relocatable: [...filtered.map((sighting) => sighting.task), ...byLines.linesIntact],
  };
  return { kept, filtered, plans: settledPlans(review.plans, settlement, context), duplicates };
}

async function judgedAgainstMerges(sighted: SymbolSightings, context: ProjectContext, { repo, origins, projectId }: RepoScope): Promise<MergeJudgement> {
  const { pending, unknownBranches } = await awaitingMerge({ repo, taskIds: involvedTaskIds(sighted), origins });
  const judged = (id: string) => !pending.has(id);
  const code = await Promise.all(sighted.kept.filter((candidate) => judged(candidate.task.id)).map((candidate) => withContext(candidate, context)));
  return {
    candidates: [...code, ...sighted.duplicates],
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

async function withRenamesFollowed(review: CodeReview, tasks: readonly Task[], { repo, onUnreadable }: RepoScope): Promise<CodeReview> {
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

function uncheckedEvidence(tasks: readonly Task[], anchors: AnchorStates, { history, branches, existing }: RepoFacts): TaskEvidence[] {
  const changeUnchecked = history === "read" ? [] : tasks.filter((task) => judgedByCommits(task, anchors));
  const missingUnchecked = branches.kind === "unreadable" ? tasks.filter((task) => task.source !== undefined && !existing.has(sourcePath(task.source))) : [];
  return [...evidenceOf(changeUnchecked, "source-changed"), ...evidenceOf(missingUnchecked, "source-missing")];
}

function evidenceOf(tasks: readonly Task[], evidence: CandidateEvidence): TaskEvidence[] {
  return tasks.map((task) => ({ task: task.id, evidence }));
}

function historyProblems(project: Project, repo: string, { history, branches }: RepoFacts): CheckProblem[] {
  switch (history) {
    case "read":
      return branches.kind === "unreadable" ? [{ kind: "project-branches-unreadable", projectId: project.id, repo }] : [];
    case "not-a-repo":
      return [{ kind: "project-repo-not-git", projectId: project.id, repo }];
    case "unsafe-repo":
      return [{ kind: "project-repo-unsafe", projectId: project.id, repo }];
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
  const excerpt = (await diffOf(task, candidate.path))?.excerpt;
  const problem = firstParagraph(task.body);
  const moved = current === undefined || current === task.source ? {} : { source: current };
  return { ...candidate, ...moved, ...(problem === undefined ? {} : { problem }), ...(snippet === undefined ? {} : { snippet }), ...diffFields(excerpt) };
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
