import { errorText } from "../errors";
import { basename, join } from "node:path";
import { candidateEvents, candidateGoneEvents, checkMethodOf, episodeStates, filteredEvents, type CandidateSighting, type CheckMode, type FilteredSighting } from "../journal/events";
import type { CoreMessages } from "../messages";
import { buildIndex } from "../model/graph";
import { ID_PATTERN, parseId } from "../model/ids";
import { integrityErrors } from "../model/integrity";
import { epicDoneClosure, planEpicClosing, type Closure } from "../model/lifecycle";
import type { ParseError, Project, Task } from "../model/types";
import { loadBacklog, type LoadedBacklog } from "../store/load";
import { appendJournal, readJournal } from "../store/journal";
import { PROJECT_FILE } from "../store/paths";
import { referenceCleanup } from "../store/references";
import { updateTaskInIndex, type TaskChanges } from "../store/update";
import type { UpdateTaskFailure } from "../store/write-result";
import { snippetOf } from "./anchor";
import type { CheckFix, CheckProblem } from "./findings";
import { findRepo } from "./project-repo";
import { codeReview, duplicateCandidates, isReviewable, relocationPlan, reviewMark, sourcePath, type AnchorPlan, type Candidate } from "./candidates";
import { currentSources, type CurrentSources } from "./current-source";
import { collectRepoFacts, diffsSince, type DiffExcerpt, type DiffSince, type RepoFacts } from "./repo-facts";
import { filterBySymbol, symbolLookup, symbolNames } from "./symbol-filter";
import { openCodeGraph } from "../graph/code-graph";

type CheckTexts = Pick<CoreMessages, "epicDoneReason" | "candidatesRecordFailed">;

export type CheckRequest = { projectIds: readonly string[]; mode: CheckMode; now: Date; home: string; messages: CheckTexts };

export type CheckReport = { fixed: CheckFix[]; problems: CheckProblem[]; candidates: Candidate[] };

type Fix = { changes: TaskChanges; closure?: Closure; done: CheckFix[] };
type EpicClosing = { closure: Closure; childIds: string[] };
const PROBLEM_LIMIT = 400;

type ProjectReview = { candidates: Candidate[]; filtered: FilteredSighting[]; plans: AnchorPlan[] };
type FixOutcome = { fixed: CheckFix[]; failed: CheckProblem[] };

export async function checkBacklog(root: string, loaded: LoadedBacklog, request: CheckRequest): Promise<CheckReport> {
  const inScope = (projectId: string) => request.projectIds.includes(projectId);
  const fixes: FixOutcome = request.mode === "full" ? await applyFixes(loaded, inScope, request) : { fixed: [], failed: [] };
  const current = fixes.fixed.length > 0 ? await loadBacklog(root) : loaded;

  const projects = current.projects.filter((project) => inScope(project.id));
  const repos = new Map(await Promise.all(projects.map(async (project) => [project.id, await findRepo(project, request.home)] as const)));
  const reviews = await Promise.all(projects.map((project) => projectReview(project, current.tasks, repos.get(project.id), request)));
  const candidates = reviews.flatMap((review) => review.candidates);
  const moved = await applyAnchorPlans(current.tasks, reviews.flatMap((review) => review.plans), request.now);
  await recordCandidates(root, current.tasks, { candidates, filtered: reviews.flatMap((review) => review.filtered) }, request);
  const problems = request.mode === "full" ? [...fixes.failed, ...findProblems(current, projects, repos, inScope)] : [];
  return { fixed: [...fixes.fixed, ...moved], problems, candidates };
}

type CheckFindings = { candidates: readonly Candidate[]; filtered: readonly FilteredSighting[] };

async function recordCandidates(root: string, tasks: readonly Task[], { candidates, filtered }: CheckFindings, { mode, now, projectIds, messages }: CheckRequest): Promise<void> {
  const projectOf = new Map(tasks.map((task) => [task.id, task.projectId]));
  for (const projectId of projectIds) {
    const dir = join(root, projectId);
    const found = candidates.filter((candidate) => projectOf.get(candidate.task.id) === projectId);
    const filteredHere = filtered.filter((sighting) => projectOf.get(sighting.task) === projectId);
    const reviewed = tasks.filter((task) => task.projectId === projectId && isReviewable(task)).map((task) => task.id);
    if (found.length === 0 && filteredHere.length === 0 && (mode !== "full" || reviewed.length === 0)) continue;
    try {
      const journal = await readJournal(dir, projectId);
      const states = episodeStates(journal.events);
      const sightings = found.map(sightingOf);
      const gone = mode === "full" ? candidateGoneEvents(sightings, reviewed, states, now) : [];
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
  if (candidate.kind === "source-changed") return { ...sighting, method: checkMethodOf(candidate) };
  if (candidate.kind === "duplicate") return { ...sighting, match: candidate.match };
  return sighting;
}

async function applyFixes(loaded: LoadedBacklog, inScope: (projectId: string) => boolean, { now, messages }: CheckRequest): Promise<FixOutcome> {
  const isGone = goneTaskCheck(loaded);
  const epicClosures = new Map(
    planEpicClosing(loaded.tasks, loaded.errors).close.map(({ epic, childIds }): [string, EpicClosing] => [epic.id, { closure: epicDoneClosure(childIds, messages), childIds }]),
  );
  const index = buildIndex(loaded.tasks);
  const fixed: CheckFix[] = [];
  const failed: CheckProblem[] = [];
  for (const task of loaded.tasks.filter((candidate) => inScope(candidate.projectId))) {
    const fix = planFix(task, isGone, epicClosures.get(task.id));
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

function planFix(task: Task, isGone: (id: string) => boolean, epicClosing: EpicClosing | undefined): Fix | null {
  const cleanup = referenceCleanup(task, isGone);
  if (cleanup === null && epicClosing === undefined) return null;

  const done: CheckFix[] = [];
  if (cleanup !== null) done.push({ kind: "references-removed", taskId: task.id, ids: goneReferences(task, isGone) });
  if (epicClosing === undefined) return { changes: cleanup ?? {}, done };
  done.push({ kind: "epic-closed", taskId: task.id, childIds: epicClosing.childIds });
  return { changes: { ...cleanup, status: "done" }, closure: epicClosing.closure, done };
}

function goneReferences(task: Task, isGone: (id: string) => boolean): string[] {
  const references = [...task.blockedBy, ...task.related, ...(task.epic === undefined ? [] : [task.epic])];
  return [...new Set(references.filter(isGone))];
}

function goneTaskCheck(loaded: LoadedBacklog): (id: string) => boolean {
  const known = new Set([...loaded.tasks.map((task) => task.id), ...unparsedTaskIds(loaded.errors)]);
  const loadedPrefixes = new Set(loaded.projects.map((project) => project.prefix));
  return (id) => {
    const prefix = parseId(id)?.prefix;
    return prefix !== undefined && loadedPrefixes.has(prefix) && !known.has(id);
  };
}

function unparsedTaskIds(errors: readonly ParseError[]): string[] {
  return errors.map((error) => basename(error.path, ".md")).filter((name) => ID_PATTERN.test(name));
}

async function projectReview(project: Project, allTasks: readonly Task[], repo: string | undefined, { mode }: CheckRequest): Promise<ProjectReview> {
  const tasks = allTasks.filter((task) => task.projectId === project.id && isReviewable(task));
  if (tasks.length === 0) return { candidates: [], filtered: [], plans: [] };
  if (repo === undefined) return { candidates: mode === "full" ? duplicateCandidates(tasks) : [], filtered: [], plans: [] };

  const since = new Date(Math.min(...tasks.map(reviewMark)));
  const paths = [...new Set(tasks.flatMap((task) => (task.source === undefined ? [] : [sourcePath(task.source)])))];
  const facts = await collectRepoFacts(repo, { since, paths });
  const review = codeReview(tasks, facts);
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const diffOf = diffsSince(repo);
  const graph = openCodeGraph(repo);
  try {
    const symbolAt = symbolLookup(repo, graph);
    const changedIds = new Set(review.candidates.flatMap((candidate) => (candidate.kind === "source-changed" ? [candidate.task.id] : [])));
    const locating = mode === "full" && graph !== null ? tasks : tasks.filter((task) => changedIds.has(task.id));
    const located = await currentSources(locating, facts, diffOf);
    const duplicates = mode === "full" ? duplicateCandidates(tasks, symbolNames(symbolAt, located)) : [];
    const { kept, filtered } = await filterBySymbol(review.candidates, { tasksById, located, diffOf, symbolAt });
    const code = await Promise.all(kept.map((candidate) => withContext(candidate, tasksById, located, facts, diffOf)));
    const plans = settledPlans(review.plans, { kept, filtered, tasksById, located, facts });
    return { candidates: mode === "full" ? [...code, ...duplicates] : code, filtered, plans };
  } finally {
    graph?.close();
  }
}

type PlanInputs = { kept: readonly Candidate[]; filtered: readonly FilteredSighting[]; tasksById: ReadonlyMap<string, Task>; located: CurrentSources; facts: RepoFacts };

function settledPlans(plans: readonly AnchorPlan[], { kept, filtered, tasksById, located, facts }: PlanInputs): AnchorPlan[] {
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

async function withContext(candidate: Candidate, tasksById: ReadonlyMap<string, Task>, located: CurrentSources, facts: RepoFacts, diffOf: DiffSince): Promise<Candidate> {
  if (candidate.kind !== "source-changed") return candidate;
  const task = tasksById.get(candidate.task.id);
  if (task === undefined) return candidate;
  const text = facts.texts.get(candidate.path);
  const source = located.get(task.id) ?? task.source;
  const snippet = text === undefined || source === undefined ? undefined : snippetOf(text, source);
  const excerpt = (await diffOf(candidate.path, new Date(reviewMark(task))))?.excerpt;
  const problem = firstParagraph(task.body);
  return { ...candidate, ...(problem === undefined ? {} : { problem }), ...(snippet === undefined ? {} : { snippet }), ...diffFields(excerpt) };
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
  return [...parseProblems(loaded, inScope), ...integrity, ...missingRepos];
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
