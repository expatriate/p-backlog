import { join } from "node:path";
import { openCodeGraph, type CodeGraph } from "../graph/code-graph";
import type { CandidateEvidence, CheckMode, FilteredSighting, TaskOrigin } from "../journal/events";
import type { Project, Task } from "../model/types";
import { readJournal } from "../store/journal";
import { snippetOf } from "./anchor";
import { mergesKnownAtCreation } from "./known-merges";
import { anchorStates, codeReview, isReviewable, relocationPlan, reviewMark, type AnchorPlan, type Candidate, type CodeReview } from "./candidates";
import { duplicateCandidates } from "./duplicates";
import { currentSources } from "./current-source";
import type { CheckProblem } from "./findings";
import { awaitingMerge } from "./awaiting-merge";
import { collectRepoFacts, diffsSince, type DiffExcerpt, type GitHistory, type RepoFacts } from "./repo-facts";
import { sourcePath } from "../model/source";
import { fileHashes, filterBySymbol, symbolLookup, symbolNames, type SymbolFilterContext, type SymbolFilterResult } from "./symbol-filter";

const PROBLEM_LIMIT = 400;

export type ProjectReview = {
  projectId: string;
  candidates: Candidate[];
  filtered: FilteredSighting[];
  plans: AnchorPlan[];
  problems: CheckProblem[];
  unchecked: CandidateEvidence[];
  awaitingMerge: string[];
};

type ProjectContext = SymbolFilterContext & { facts: RepoFacts };

type SymbolSightings = SymbolFilterResult & { context: ProjectContext; plans: AnchorPlan[]; duplicates: Candidate[] };

type SightingScope = { repo: string; facts: RepoFacts; graph: CodeGraph | null; mode: CheckMode };

export async function creationOrigins(root: string, projectId: string, onUnreadable: (error: unknown) => void): Promise<Map<string, TaskOrigin>> {
  const journal = await readJournal(join(root, projectId), projectId).catch((error: unknown) => {
    onUnreadable(error);
    return null;
  });
  return new Map((journal?.events ?? []).flatMap((event) => (event.kind === "created" && event.origin !== undefined ? [[event.task, event.origin] as const] : [])));
}

export async function projectReview(project: Project, allTasks: readonly Task[], repo: string | undefined, origins: ReadonlyMap<string, TaskOrigin>, mode: CheckMode): Promise<ProjectReview> {
  const tasks = allTasks.filter((task) => task.projectId === project.id && isReviewable(task));
  const nothing = { projectId: project.id, candidates: [], filtered: [], plans: [], problems: [], unchecked: [], awaitingMerge: [] };
  if (tasks.length === 0) return nothing;
  if (repo === undefined) return { ...nothing, candidates: mode === "full" ? duplicateCandidates(tasks) : [], unchecked: ["source-changed", "source-missing"] };

  const facts = await collectRepoFacts(repo, earliestMarks(tasks));
  const anchors = anchorStates(tasks, facts);
  const review = codeReview(tasks, facts, await mergesKnownAtCreation({ repo, tasks, facts, anchors, origins: creationCommits(origins) }), anchors);
  const graph = openCodeGraph(repo);
  try {
    const sighted = await sightedBySymbol(tasks, review, { repo, facts, graph, mode });
    const awaiting = await awaitingMerge({ repo, taskIds: involvedTaskIds(sighted), origins });
    const judged = (id: string) => !awaiting.has(id);
    const code = await Promise.all(sighted.kept.filter((candidate) => judged(candidate.task.id)).map((candidate) => withContext(candidate, sighted.context)));
    return {
      projectId: project.id,
      candidates: [...code, ...sighted.duplicates],
      filtered: sighted.filtered.filter((sighting) => judged(sighting.task)),
      plans: sighted.plans.filter((plan) => judged(plan.id)),
      problems: historyProblems(project, repo, facts.history),
      unchecked: facts.history === "read" ? [] : ["source-changed"],
      awaitingMerge: [...awaiting],
    };
  } finally {
    graph?.close();
  }
}

async function sightedBySymbol(tasks: readonly Task[], review: CodeReview, { repo, facts, graph, mode }: SightingScope): Promise<SymbolSightings> {
  const full = mode === "full";
  const diffOf = diffsSince(repo);
  const symbolAt = symbolLookup(graph, fileHashes(repo));
  const changedIds = new Set(review.candidates.flatMap((candidate) => (candidate.kind === "source-changed" ? [candidate.task.id] : [])));
  const locating = full && graph !== null ? tasks : tasks.filter((task) => changedIds.has(task.id));
  const located = await currentSources(locating, facts, diffOf);
  const duplicates = full ? duplicateCandidates(tasks, symbolNames(symbolAt, located)) : [];
  const context: ProjectContext = { tasksById: new Map(tasks.map((task) => [task.id, task])), located, facts, diffOf, symbolAt };
  const { kept, filtered } = await filterBySymbol(review.candidates, context);
  return { kept, filtered, plans: settledPlans(review.plans, { kept, filtered }, context), duplicates, context };
}

function involvedTaskIds({ kept, filtered, plans }: SymbolSightings): string[] {
  return [...new Set([...kept.map((candidate) => candidate.task.id), ...filtered.map((sighting) => sighting.task), ...plans.map((plan) => plan.id)])];
}

function historyProblems(project: Project, repo: string, history: GitHistory): CheckProblem[] {
  switch (history) {
    case "read":
      return [];
    case "not-a-repo":
      return [{ kind: "project-repo-not-git", projectId: project.id, repo }];
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

function creationCommits(origins: ReadonlyMap<string, TaskOrigin>): Map<string, string> {
  return new Map([...origins].map(([id, origin]) => [id, origin.commit]));
}

function settledPlans(plans: readonly AnchorPlan[], { kept, filtered }: SymbolFilterResult, { tasksById, located, facts }: ProjectContext): AnchorPlan[] {
  const flagged = new Set(kept.map((candidate) => candidate.task.id));
  const relocations = new Map(
    filtered.flatMap(({ task: id }): [string, AnchorPlan][] => {
      const task = tasksById.get(id);
      const current = located.get(id);
      const plan = task === undefined || current === null || current === undefined ? null : relocationPlan(task, current, facts);
      return plan === null ? [] : [[id, plan]];
    }),
  );
  return [...plans.filter((plan) => !flagged.has(plan.id) && !relocations.has(plan.id)), ...relocations.values()];
}

async function withContext(candidate: Candidate, { tasksById, located, facts, diffOf }: ProjectContext): Promise<Candidate> {
  if (candidate.kind !== "source-changed") return candidate;
  const task = tasksById.get(candidate.task.id);
  if (task === undefined) return candidate;
  const text = facts.texts.get(candidate.path);
  const current = located.get(task.id) ?? undefined;
  const source = current ?? task.source;
  const snippet = text === undefined || source === undefined ? undefined : snippetOf(text, source);
  const excerpt = (await diffOf(candidate.path, new Date(reviewMark(task))))?.excerpt;
  const problem = firstParagraph(task.body);
  const moved = current === undefined || current === task.source ? {} : { source: current };
  return { ...candidate, ...moved, ...(problem === undefined ? {} : { problem }), ...(snippet === undefined ? {} : { snippet }), ...diffFields(excerpt) };
}

function diffFields(excerpt: DiffExcerpt | undefined): { diff?: string; diffOmittedLines?: number } {
  if (excerpt === undefined) return {};
  return excerpt.omittedLines === 0 ? { diff: excerpt.text } : { diff: excerpt.text, diffOmittedLines: excerpt.omittedLines };
}

function firstParagraph(body: string): string | undefined {
  const paragraph = body.trim().split(/\n\s*\n/)[0]?.trim() ?? "";
  if (paragraph === "") return undefined;
  return paragraph.length <= PROBLEM_LIMIT ? paragraph : `${paragraph.slice(0, PROBLEM_LIMIT)}…`;
}
