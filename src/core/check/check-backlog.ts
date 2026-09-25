import { errorText } from "../errors";
import { basename, join } from "node:path";
import { CANDIDATE_EVIDENCE, candidateEvents, candidateGoneEvents, episodeStates, filteredEvents, type CandidateEvidence, type CandidateSighting, type CheckMode, type FilteredSighting, type TaskOrigin } from "../journal/events";
import type { CoreMessages } from "../messages";
import { buildIndex } from "../model/graph";
import { parseId } from "../model/ids";
import { integrityErrors } from "../model/integrity";
import { epicDoneClosure, planEpicClosing, planEpicReopening, type Closure } from "../model/lifecycle";
import type { ParseError, Project, Task, TaskStatus } from "../model/types";
import { loadBacklog, unparsedTasks, type LoadedBacklog } from "../store/load";
import { appendJournal, readJournal } from "../store/journal";
import { PROJECT_FILE } from "../store/paths";
import { referenceCleanup } from "../store/references";
import { statusToReopen, updateTaskInIndex, type TaskChanges } from "../store/update";
import type { UpdateTaskFailure } from "../store/write-result";
import { snippetOf } from "./anchor";
import type { CheckFix, CheckProblem } from "./findings";
import { projectCheckout } from "./project-repo";
import { mergesKnownAtCreation } from "./branch-merges";
import { awaitingMerge } from "./pending-branches";
import { findGitRoots } from "../store/resolve-project";
import { codeReview, duplicateCandidates, isReviewable, relocationPlan, reviewMark, type AnchorPlan, type Candidate } from "./candidates";
import { currentSources } from "./current-source";
import { collectRepoFacts, diffsSince, type DiffExcerpt, type GitHistory, type RepoFacts } from "./repo-facts";
import { fileHashes, filterBySymbol, symbolLookup, symbolNames, type SymbolFilterContext, type SymbolFilterResult } from "./symbol-filter";
import { sourcePath } from "./source-lines";
import { openCodeGraph } from "../graph/code-graph";

type CheckTexts = Pick<CoreMessages, "epicDoneReason" | "candidatesRecordFailed">;

export type CheckRequest = { projectIds: readonly string[]; mode: CheckMode; now: Date; home: string; messages: CheckTexts; workingDir?: string | undefined };

export type CheckReport = { fixed: CheckFix[]; problems: CheckProblem[]; candidates: Candidate[] };

type CheckCoverage = { repairs: boolean; reportsProblems: boolean; findsDuplicates: boolean; locatesAllSources: boolean; endsGoneEpisodes: boolean };

const COVERAGE: Record<CheckMode, CheckCoverage> = {
  full: { repairs: true, reportsProblems: true, findsDuplicates: true, locatesAllSources: true, endsGoneEpisodes: true },
  changed: { repairs: false, reportsProblems: false, findsDuplicates: false, locatesAllSources: false, endsGoneEpisodes: false },
};

type Fix = { changes: TaskChanges; closure?: Closure | undefined; done: CheckFix[] };
type EpicStatusFix = { status: TaskStatus; closure?: Closure | undefined; done: CheckFix };
const PROBLEM_LIMIT = 400;

type ProjectReview = {
  projectId: string;
  candidates: Candidate[];
  filtered: FilteredSighting[];
  plans: AnchorPlan[];
  problems: CheckProblem[];
  unchecked: CandidateEvidence[];
  awaitingMerge: string[];
};
type FixOutcome = { fixed: CheckFix[]; failed: CheckProblem[] };

export async function checkBacklog(root: string, loaded: LoadedBacklog, request: CheckRequest): Promise<CheckReport> {
  const inScope = (projectId: string) => request.projectIds.includes(projectId);
  const coverage = COVERAGE[request.mode];
  const fixes: FixOutcome = coverage.repairs ? await applyFixes(loaded, inScope, request) : { fixed: [], failed: [] };
  const current = fixes.fixed.length > 0 ? await loadBacklog(root) : loaded;

  const projects = current.projects.filter((project) => inScope(project.id));
  const workingRoots = request.workingDir === undefined ? null : findGitRoots(request.workingDir);
  const checkouts = new Map(await Promise.all(projects.map(async (project) => [project.id, await projectCheckout(project, request.home, workingRoots)] as const)));
  const repos = new Map([...checkouts].map(([projectId, checkout]) => [projectId, checkout?.path]));
  const reviews = await Promise.all(projects.map(async (project) => projectReview(project, current.tasks, repos.get(project.id), await creationOrigins(root, project.id), request)));
  const candidates = reviews.flatMap((review) => review.candidates);
  const anchorPlans = reviews.filter((review) => checkouts.get(review.projectId)?.linkedWorktree !== true).flatMap((review) => review.plans);
  const moved = await applyAnchorPlans(current.tasks, anchorPlans, request.now);
  const unchecked = new Map(reviews.map((review) => [review.projectId, review.unchecked]));
  const awaiting = new Set(reviews.flatMap((review) => review.awaitingMerge));
  const judged = current.tasks.filter((task) => !awaiting.has(task.id));
  await recordCandidates(root, judged, { candidates, filtered: reviews.flatMap((review) => review.filtered), unchecked }, request);
  const reviewProblems = reviews.flatMap((review) => review.problems);
  const problems = coverage.reportsProblems ? [...fixes.failed, ...findProblems(current, projects, repos, inScope), ...reviewProblems] : [];
  return { fixed: [...fixes.fixed, ...moved], problems, candidates };
}

type CheckFindings = { candidates: readonly Candidate[]; filtered: readonly FilteredSighting[]; unchecked: ReadonlyMap<string, readonly CandidateEvidence[]> };

async function recordCandidates(root: string, tasks: readonly Task[], { candidates, filtered, unchecked }: CheckFindings, { mode, now, projectIds, messages }: CheckRequest): Promise<void> {
  const projectOf = new Map(tasks.map((task) => [task.id, task.projectId]));
  for (const projectId of projectIds) {
    const dir = join(root, projectId);
    const found = candidates.filter((candidate) => projectOf.get(candidate.task.id) === projectId);
    const filteredHere = filtered.filter((sighting) => projectOf.get(sighting.task) === projectId);
    const reviewed = tasks.filter((task) => task.projectId === projectId && isReviewable(task)).map((task) => task.id);
    const endsGone = COVERAGE[mode].endsGoneEpisodes;
    if (found.length === 0 && filteredHere.length === 0 && (!endsGone || reviewed.length === 0)) continue;
    try {
      const journal = await readJournal(dir, projectId);
      const states = episodeStates(journal.events);
      const sightings = found.map(sightingOf);
      const checked = CANDIDATE_EVIDENCE.filter((evidence) => !(unchecked.get(projectId) ?? []).includes(evidence));
      const gone = endsGone ? candidateGoneEvents(sightings, reviewed, states, now, checked) : [];
      await appendJournal(dir, [...candidateEvents(sightings, states, now, mode), ...gone, ...filteredEvents(filteredHere, now)], (path, error) => {
        throw error;
      });
    } catch (error) {
      console.error(messages.candidatesRecordFailed(projectId, errorText(error)));
    }
  }
}

function sightingOf(candidate: Candidate): CandidateSighting {
  const sighting = { task: candidate.task.id, evidence: candidate.kind };
  if (candidate.kind === "source-changed") return { ...sighting, method: candidate.method };
  if (candidate.kind === "duplicate") return { ...sighting, match: candidate.match };
  return sighting;
}

async function applyFixes(loaded: LoadedBacklog, inScope: (projectId: string) => boolean, { now, messages }: CheckRequest): Promise<FixOutcome> {
  const isGone = goneTaskCheck(loaded);
  const epicFixes = await epicStatusFixes(loaded, inScope, messages);
  const index = buildIndex(loaded.tasks);
  const fixed: CheckFix[] = [];
  const failed: CheckProblem[] = [];
  for (const task of loaded.tasks.filter((candidate) => inScope(candidate.projectId))) {
    const fix = planFix(task, isGone, epicFixes.get(task.id));
    if (fix === null) continue;
    const result = await updateTaskInIndex(index, { id: task.id, changes: fix.changes, expectedVersion: task.version, now, closure: fix.closure, via: "check" });
    if (result.ok) fixed.push(...fix.done);
    else failed.push(fixFailure(task.id, result));
  }
  return { fixed, failed };
}

function fixFailure(taskId: string, failure: UpdateTaskFailure): CheckProblem {
  switch (failure.reason) {
    case "invalid":
      return { kind: "fix-failed", taskId, cause: "invalid", problems: failure.errors };
    case "conflict":
      return { kind: "fix-failed", taskId, cause: "changed-during-check" };
    case "not-found":
      return { kind: "fix-failed", taskId, cause: "gone-during-check" };
  }
}

async function epicStatusFixes(loaded: LoadedBacklog, inScope: (projectId: string) => boolean, messages: CheckTexts): Promise<Map<string, EpicStatusFix>> {
  const closing = planEpicClosing(loaded.tasks, loaded.errors).close.map(({ epic, childIds }): [string, EpicStatusFix] => [
    epic.id,
    { status: "done", closure: epicDoneClosure(childIds, messages), done: { kind: "epic-closed", taskId: epic.id, childIds } },
  ]);
  const reopenable = planEpicReopening(loaded.tasks).filter(({ epic }) => inScope(epic.projectId));
  const reopening = await Promise.all(
    reopenable.map(async ({ epic, childIds }): Promise<[string, EpicStatusFix]> => [epic.id, { status: await statusToReopen(epic), done: { kind: "epic-reopened", taskId: epic.id, childIds } }]),
  );
  return new Map([...closing, ...reopening]);
}

function planFix(task: Task, isGone: (id: string) => boolean, epicFix: EpicStatusFix | undefined): Fix | null {
  const cleanup = referenceCleanup(task, isGone);
  if (cleanup === null && epicFix === undefined) return null;

  const done: CheckFix[] = [];
  if (cleanup !== null) done.push({ kind: "references-removed", taskId: task.id, ids: goneReferences(task, isGone) });
  if (epicFix === undefined) return { changes: cleanup ?? {}, done };
  return { changes: { ...cleanup, status: epicFix.status }, closure: epicFix.closure, done: [...done, epicFix.done] };
}

function goneReferences(task: Task, isGone: (id: string) => boolean): string[] {
  const references = [...task.blockedBy, ...task.related, ...(task.epic === undefined ? [] : [task.epic])];
  return [...new Set(references.filter(isGone))];
}

function goneTaskCheck(loaded: LoadedBacklog): (id: string) => boolean {
  const known = new Set([...loaded.tasks.map((task) => task.id), ...unparsedTasks(loaded.errors).map((task) => task.id)]);
  const loadedPrefixes = new Set(loaded.projects.map((project) => project.prefix));
  return (id) => {
    const prefix = parseId(id)?.prefix;
    return prefix !== undefined && loadedPrefixes.has(prefix) && !known.has(id);
  };
}

async function creationOrigins(root: string, projectId: string): Promise<Map<string, TaskOrigin>> {
  const journal = await readJournal(join(root, projectId), projectId).catch(() => null);
  return new Map((journal?.events ?? []).flatMap((event) => (event.kind === "created" && event.origin !== undefined ? [[event.task, event.origin] as const] : [])));
}

async function projectReview(project: Project, allTasks: readonly Task[], repo: string | undefined, origins: ReadonlyMap<string, TaskOrigin>, { mode }: CheckRequest): Promise<ProjectReview> {
  const coverage = COVERAGE[mode];
  const tasks = allTasks.filter((task) => task.projectId === project.id && isReviewable(task));
  const nothing = { projectId: project.id, candidates: [], filtered: [], plans: [], problems: [], unchecked: [], awaitingMerge: [] };
  if (tasks.length === 0) return nothing;
  if (repo === undefined) return { ...nothing, candidates: coverage.findsDuplicates ? duplicateCandidates(tasks) : [], unchecked: ["source-changed", "source-missing"] };

  const facts = await collectRepoFacts(repo, earliestMarks(tasks));
  const review = codeReview(tasks, facts, await mergesKnownAtCreation({ repo, tasks, facts, origins: creationCommits(origins) }));
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const diffOf = diffsSince(repo);
  const graph = openCodeGraph(repo);
  try {
    const symbolAt = symbolLookup(graph, fileHashes(repo));
    const changedIds = new Set(review.candidates.flatMap((candidate) => (candidate.kind === "source-changed" ? [candidate.task.id] : [])));
    const locating = coverage.locatesAllSources && graph !== null ? tasks : tasks.filter((task) => changedIds.has(task.id));
    const located = await currentSources(locating, facts, diffOf);
    const duplicates = coverage.findsDuplicates ? duplicateCandidates(tasks, symbolNames(symbolAt, located)) : [];
    const context: ProjectContext = { tasksById, located, facts, diffOf, symbolAt };
    const { kept, filtered } = await filterBySymbol(review.candidates, context);
    const plans = settledPlans(review.plans, { kept, filtered }, context);
    const involved = new Set([...kept.map((candidate) => candidate.task.id), ...filtered.map((sighting) => sighting.task), ...plans.map((plan) => plan.id)]);
    const awaiting = await awaitingMerge({ repo, taskIds: [...involved], origins });
    const judged = (id: string) => !awaiting.has(id);
    const code = await Promise.all(kept.filter((candidate) => judged(candidate.task.id)).map((candidate) => withContext(candidate, context)));
    return {
      projectId: project.id,
      candidates: [...code, ...duplicates],
      filtered: filtered.filter((sighting) => judged(sighting.task)),
      plans: plans.filter((plan) => judged(plan.id)),
      problems: historyProblems(project, repo, facts.history),
      unchecked: facts.history === "read" ? [] : ["source-changed"],
      awaitingMerge: [...awaiting],
    };
  } finally {
    graph?.close();
  }
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

type ProjectContext = SymbolFilterContext & { facts: RepoFacts };

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

async function applyAnchorPlans(tasks: readonly Task[], plans: readonly AnchorPlan[], now: Date): Promise<CheckFix[]> {
  const index = buildIndex(tasks);
  const moved: CheckFix[] = [];
  for (const plan of plans) {
    const task = index.byId.get(plan.id);
    if (task === undefined) continue;
    const result = await updateTaskInIndex(index, { id: plan.id, changes: plan.changes, expectedVersion: task.version, now, via: "check" });
    if (result.ok && plan.moved !== undefined) moved.push(plan.moved);
  }
  return moved;
}

function findProblems(
  loaded: LoadedBacklog,
  projects: readonly Project[],
  repos: ReadonlyMap<string, string | undefined>,
  inScope: (projectId: string) => boolean,
): CheckProblem[] {
  const index = buildIndex(loaded.tasks);
  const integrity = loaded.tasks
    .filter((task) => inScope(task.projectId))
    .flatMap((task) => integrityErrors(task, index).map((problem): CheckProblem => ({ kind: "task-invalid", taskId: task.id, problem })));
  const missingRepos = projects.filter((project) => repos.get(project.id) === undefined).map(missingRepoProblem);
  return [...parseProblems(loaded, inScope), ...integrity, ...missingRepos, ...sharedPrefixes(loaded.projects, inScope)];
}

function sharedPrefixes(projects: readonly Project[], inScope: (projectId: string) => boolean): CheckProblem[] {
  const idsByPrefix = new Map<string, string[]>();
  for (const project of projects) idsByPrefix.set(project.prefix, [...(idsByPrefix.get(project.prefix) ?? []), project.id]);
  return [...idsByPrefix]
    .filter(([, projectIds]) => projectIds.length > 1 && projectIds.some(inScope))
    .map(([prefix, projectIds]): CheckProblem => ({ kind: "prefix-shared", prefix, projectIds }));
}

function parseProblems(loaded: LoadedBacklog, inScope: (projectId: string) => boolean): CheckProblem[] {
  const waitingEpicIds = planEpicClosing(loaded.tasks, loaded.errors)
    .waiting.filter(({ epic }) => inScope(epic.projectId))
    .map(({ epic }) => epic.id);
  const reported = loaded.errors
    .filter((error) => waitingEpicIds.length > 0 || inScope(error.projectId) || isProjectFileError(error))
    .map((error): CheckProblem => ({ kind: "file-not-parsed", path: error.path, problems: error.problems }));
  if (waitingEpicIds.length === 0) return reported;
  return [...reported, { kind: "epics-wait-for-files", epicIds: waitingEpicIds }];
}

function isProjectFileError(error: ParseError): boolean {
  return basename(error.path) === PROJECT_FILE;
}

function missingRepoProblem(project: Project): CheckProblem {
  return project.repos.length === 0
    ? { kind: "project-without-repos", projectId: project.id }
    : { kind: "project-repos-missing", projectId: project.id, repos: project.repos };
}
