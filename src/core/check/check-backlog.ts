import { access } from "node:fs/promises";
import { basename } from "node:path";
import { buildIndex } from "../model/graph";
import { ID_PATTERN, parseId } from "../model/ids";
import { integrityErrors } from "../model/integrity";
import { planEpicClosing, type Closure } from "../model/lifecycle";
import type { ParseError, Project, Task } from "../model/types";
import { loadBacklog, type LoadedBacklog } from "../store/load";
import { expandHome, PROJECT_FILE } from "../store/paths";
import { referenceCleanup } from "../store/references";
import { updateTaskIn, type TaskChanges } from "../store/update";
import type { UpdateTaskFailure } from "../store/write-result";
import { codeCandidates, duplicateCandidates, isReviewable, noSourceCandidates, reviewMark, sourcePath, type Candidate } from "./candidates";
import { collectRepoFacts } from "./repo-facts";

export type CheckMode = "full" | "changed";

export type CheckRequest = { projectIds: readonly string[]; mode: CheckMode; now: Date; home: string };

export type CheckReport = { fixed: string[]; problems: string[]; candidates: Candidate[] };

type Fix = { changes: TaskChanges; closure?: Closure; notes: string[] };
type FixOutcome = { fixed: string[]; failed: string[] };

export async function checkBacklog(root: string, request: CheckRequest): Promise<CheckReport> {
  const inScope = (projectId: string) => request.projectIds.includes(projectId);
  const loaded = await loadBacklog(root);
  const fixes: FixOutcome = request.mode === "full" ? await applyFixes(loaded, inScope, request.now) : { fixed: [], failed: [] };
  const current = fixes.fixed.length > 0 ? await loadBacklog(root) : loaded;

  const projects = current.projects.filter((project) => inScope(project.id));
  const repos = new Map(await Promise.all(projects.map(async (project) => [project.id, await findRepo(project, request.home)] as const)));
  const candidates = await Promise.all(projects.map((project) => projectCandidates(project, current.tasks, repos.get(project.id), request.mode)));
  const problems = request.mode === "full" ? [...fixes.failed, ...findProblems(current, projects, repos, inScope)] : [];
  return { fixed: fixes.fixed, problems, candidates: candidates.flat() };
}

async function applyFixes(loaded: LoadedBacklog, inScope: (projectId: string) => boolean, now: Date): Promise<FixOutcome> {
  const isGone = goneTaskCheck(loaded);
  const epicClosures = new Map(planEpicClosing(loaded.tasks, loaded.errors).close.map(({ epic, closure }) => [epic.id, closure]));
  const fixed: string[] = [];
  const failed: string[] = [];
  for (const task of loaded.tasks.filter((candidate) => inScope(candidate.projectId))) {
    const fix = planFix(task, isGone, epicClosures.get(task.id));
    if (fix === null) continue;
    const result = await updateTaskIn(loaded.tasks, { id: task.id, changes: fix.changes, expectedVersion: task.version, now, closure: fix.closure });
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

async function projectCandidates(project: Project, allTasks: readonly Task[], repo: string | undefined, mode: CheckMode): Promise<Candidate[]> {
  const tasks = allTasks.filter((task) => task.projectId === project.id && isReviewable(task));
  if (tasks.length === 0) return [];
  const duplicates = mode === "full" ? duplicateCandidates(tasks) : [];
  if (repo === undefined) return duplicates;

  const since = new Date(Math.min(...tasks.map(reviewMark)));
  const paths = [...new Set(tasks.flatMap((task) => (task.source === undefined ? [] : [sourcePath(task.source)])))];
  const facts = await collectRepoFacts(repo, { since, paths });
  const code = codeCandidates(tasks, facts);
  return mode === "full" ? [...code, ...duplicates, ...noSourceCandidates(tasks, facts)] : code;
}

async function findRepo(project: Project, home: string): Promise<string | undefined> {
  for (const repo of project.repos.map((path) => expandHome(path, home))) {
    if (await access(repo).then(() => true, () => false)) return repo;
  }
  return undefined;
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
