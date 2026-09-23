import { errorText } from "../errors";
import { basename, join } from "node:path";
import { candidateEvents, candidateGoneEvents, episodeStates, type CandidateSighting, type CheckMode } from "../journal/events";
import { buildIndex } from "../model/graph";
import { ID_PATTERN, parseId } from "../model/ids";
import { integrityErrors } from "../model/integrity";
import { planEpicClosing, type Closure } from "../model/lifecycle";
import type { ParseError, Project, Task } from "../model/types";
import { loadBacklog, type LoadedBacklog } from "../store/load";
import { appendJournal, readJournal } from "../store/journal";
import { PROJECT_FILE } from "../store/paths";
import { referenceCleanup } from "../store/references";
import { updateTaskInIndex, type TaskChanges } from "../store/update";
import type { UpdateTaskFailure } from "../store/write-result";
import { snippetOf } from "./anchor";
import { findRepo } from "./project-repo";
import { codeReview, duplicateCandidates, isReviewable, reviewMark, sourcePath, type AnchorPlan, type Candidate } from "./candidates";
import { collectRepoFacts, diffsSince, type DiffSince, type RepoFacts } from "./repo-facts";
import { filterBySymbol, symbolLookup, symbolNames } from "./symbol-filter";
import { openCodeGraph } from "../graph/code-graph";

export type CheckRequest = { projectIds: readonly string[]; mode: CheckMode; now: Date; home: string };

export type CheckReport = { fixed: string[]; problems: string[]; candidates: Candidate[] };

type Fix = { changes: TaskChanges; closure?: Closure; notes: string[] };
const PROBLEM_LIMIT = 400;

type ProjectReview = { candidates: Candidate[]; plans: AnchorPlan[] };
type FixOutcome = { fixed: string[]; failed: string[] };

export async function checkBacklog(root: string, loaded: LoadedBacklog, request: CheckRequest): Promise<CheckReport> {
  const inScope = (projectId: string) => request.projectIds.includes(projectId);
  const fixes: FixOutcome = request.mode === "full" ? await applyFixes(loaded, inScope, request.now) : { fixed: [], failed: [] };
  const current = fixes.fixed.length > 0 ? await loadBacklog(root) : loaded;

  const projects = current.projects.filter((project) => inScope(project.id));
  const repos = new Map(await Promise.all(projects.map(async (project) => [project.id, await findRepo(project, request.home)] as const)));
  const reviews = await Promise.all(projects.map((project) => projectReview(project, current.tasks, repos.get(project.id), request.mode)));
  const candidates = reviews.flatMap((review) => review.candidates);
  const moved = await applyAnchorPlans(current.tasks, reviews.flatMap((review) => review.plans), request.now);
  await recordCandidates(root, current.tasks, candidates, request);
  const problems = request.mode === "full" ? [...fixes.failed, ...findProblems(current, projects, repos, inScope)] : [];
  return { fixed: [...fixes.fixed, ...moved], problems, candidates };
}

async function recordCandidates(root: string, tasks: readonly Task[], candidates: readonly Candidate[], { mode, now, projectIds }: CheckRequest): Promise<void> {
  const projectOf = new Map(tasks.map((task) => [task.id, task.projectId]));
  for (const projectId of projectIds) {
    const dir = join(root, projectId);
    const found = candidates.filter((candidate) => projectOf.get(candidate.task.id) === projectId);
    const reviewed = tasks.filter((task) => task.projectId === projectId && isReviewable(task)).map((task) => task.id);
    if (found.length === 0 && (mode !== "full" || reviewed.length === 0)) continue;
    try {
      const journal = await readJournal(dir, projectId);
      const states = episodeStates(journal.events);
      const sightings = found.map((candidate): CandidateSighting => ({
        task: candidate.task.id,
        evidence: candidate.kind,
        ...(candidate.kind === "source-changed" ? { bySymbol: candidate.bySymbol, byAnchor: candidate.byAnchor } : {}),
      }));
      const gone = mode === "full" ? candidateGoneEvents(sightings, reviewed, states, now) : [];
      await appendJournal(dir, [...candidateEvents(sightings, states, now, mode), ...gone]);
    } catch (error) {
      console.error(`Не удалось записать кандидатов в журнал ${projectId}: ${errorText(error)}`);
    }
  }
}

async function applyFixes(loaded: LoadedBacklog, inScope: (projectId: string) => boolean, now: Date): Promise<FixOutcome> {
  const isGone = goneTaskCheck(loaded);
  const epicClosures = new Map(planEpicClosing(loaded.tasks, loaded.errors).close.map(({ epic, closure }) => [epic.id, closure]));
  const index = buildIndex(loaded.tasks);
  const fixed: string[] = [];
  const failed: string[] = [];
  for (const task of loaded.tasks.filter((candidate) => inScope(candidate.projectId))) {
    const fix = planFix(task, isGone, epicClosures.get(task.id));
    if (fix === null) continue;
    const result = await updateTaskInIndex(index, { id: task.id, changes: fix.changes, expectedVersion: task.version, now, closure: fix.closure, via: "check" });
    if (result.ok) fixed.push(...fix.notes.map((note) => `${task.id}: ${note}`));
    else failed.push(`${task.id}: не удалось исправить — ${fixFailure(result)}`);
  }
  return { fixed, failed };
}

function fixFailure(failure: UpdateTaskFailure): string {
  switch (failure.reason) {
    case "invalid":
      return failure.errors.join("; ");
    case "conflict":
      return "файл изменился во время проверки";
    case "not-found":
      return "файл исчез во время проверки";
  }
}

function planFix(task: Task, isGone: (id: string) => boolean, epicClosure: Closure | undefined): Fix | null {
  const cleanup = referenceCleanup(task, isGone);
  if (cleanup === null && epicClosure === undefined) return null;

  const notes: string[] = [];
  if (cleanup !== null) notes.push(`убраны ссылки на несуществующие задачи: ${goneReferences(task, isGone).join(", ")}`);
  if (epicClosure === undefined) return { changes: cleanup ?? {}, notes };
  notes.push(`эпик закрыт — ${epicClosure.reason}`);
  return { changes: { ...cleanup, status: "done" }, closure: epicClosure, notes };
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

async function projectReview(project: Project, allTasks: readonly Task[], repo: string | undefined, mode: CheckMode): Promise<ProjectReview> {
  const tasks = allTasks.filter((task) => task.projectId === project.id && isReviewable(task));
  if (tasks.length === 0) return { candidates: [], plans: [] };
  if (repo === undefined) return { candidates: mode === "full" ? duplicateCandidates(tasks) : [], plans: [] };

  const since = new Date(Math.min(...tasks.map(reviewMark)));
  const paths = [...new Set(tasks.flatMap((task) => (task.source === undefined ? [] : [sourcePath(task.source)])))];
  const facts = await collectRepoFacts(repo, { since, paths });
  const review = codeReview(tasks, facts);
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const diffOf = diffsSince(repo);
  const graph = openCodeGraph(repo);
  try {
    const symbolOf = symbolLookup(repo, graph);
    const duplicates = mode === "full" ? duplicateCandidates(tasks, symbolNames(symbolOf)) : [];
    const kept = await filterBySymbol(review.candidates, tasksById, diffOf, symbolOf);
    const flagged = new Set(kept.map((candidate) => candidate.task.id));
    const code = await Promise.all(kept.map((candidate) => withContext(candidate, tasksById, facts, diffOf)));
    return { candidates: mode === "full" ? [...code, ...duplicates] : code, plans: review.plans.filter((plan) => !flagged.has(plan.id)) };
  } finally {
    graph?.close();
  }
}

async function withContext(candidate: Candidate, tasksById: ReadonlyMap<string, Task>, facts: RepoFacts, diffOf: DiffSince): Promise<Candidate> {
  if (candidate.kind !== "source-changed") return candidate;
  const task = tasksById.get(candidate.task.id);
  if (task === undefined) return candidate;
  const text = facts.texts.get(candidate.path);
  const snippet = text === undefined || task.source === undefined ? undefined : snippetOf(text, task.source);
  const diff = (await diffOf(candidate.path, new Date(reviewMark(task))))?.excerpt;
  const problem = firstParagraph(task.body);
  return { ...candidate, ...(problem === undefined ? {} : { problem }), ...(snippet === undefined ? {} : { snippet }), ...(diff === undefined ? {} : { diff }) };
}

function firstParagraph(body: string): string | undefined {
  const paragraph = body.trim().split(/\n\s*\n/)[0]?.trim() ?? "";
  if (paragraph === "") return undefined;
  return paragraph.length <= PROBLEM_LIMIT ? paragraph : `${paragraph.slice(0, PROBLEM_LIMIT)}…`;
}

async function applyAnchorPlans(tasks: readonly Task[], plans: readonly AnchorPlan[], now: Date): Promise<string[]> {
  const index = buildIndex(tasks);
  const notes: string[] = [];
  for (const plan of plans) {
    const task = index.byId.get(plan.id);
    if (task === undefined) continue;
    const result = await updateTaskInIndex(index, { id: plan.id, changes: plan.changes, expectedVersion: task.version, now, via: "check" });
    if (result.ok && plan.note !== undefined) notes.push(plan.note);
  }
  return notes;
}

function findProblems(
  loaded: LoadedBacklog,
  projects: readonly Project[],
  repos: ReadonlyMap<string, string | undefined>,
  inScope: (projectId: string) => boolean,
): string[] {
  const index = buildIndex(loaded.tasks);
  const integrity = loaded.tasks
    .filter((task) => inScope(task.projectId))
    .flatMap((task) => integrityErrors(task, index).map((error) => `${task.id}: ${error}`));
  const missingRepos = projects.filter((project) => repos.get(project.id) === undefined).map(missingRepoProblem);
  return [...parseProblems(loaded, inScope), ...integrity, ...missingRepos];
}

function parseProblems(loaded: LoadedBacklog, inScope: (projectId: string) => boolean): string[] {
  const waitingEpicIds = planEpicClosing(loaded.tasks, loaded.errors)
    .waiting.filter(({ epic }) => inScope(epic.projectId))
    .map(({ epic }) => epic.id);
  const reported = loaded.errors
    .filter((error) => waitingEpicIds.length > 0 || inScope(error.projectId) || isProjectFileError(error))
    .map((error) => `Файл ${error.path} не разобран: ${error.message}`);
  if (waitingEpicIds.length === 0) return reported;
  return [...reported, `Эпики ${waitingEpicIds.join(", ")} завершены, но не закроются, пока не исправлены неразобранные файлы`];
}

function isProjectFileError(error: ParseError): boolean {
  return basename(error.path) === PROJECT_FILE;
}

function missingRepoProblem(project: Project): string {
  return project.repos.length === 0
    ? `Проект ${project.id}: в repos нет путей — код его задач не проверить`
    : `Проект ${project.id}: ни один путь из repos не существует (${project.repos.join(", ")}) — код его задач не проверить`;
}
