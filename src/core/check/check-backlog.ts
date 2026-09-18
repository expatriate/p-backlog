import { access } from "node:fs/promises";
import { basename } from "node:path";
import { buildIndex, epicChildren, isClosed, type BacklogIndex } from "../model/graph";
import { ID_PATTERN } from "../model/ids";
import { integrityErrors } from "../model/integrity";
import type { Closure } from "../model/lifecycle";
import type { ParseError, Project, Task } from "../model/types";
import { loadBacklog, type LoadedBacklog } from "../store/load";
import { expandHome } from "../store/paths";
import { referenceCleanup } from "../store/references";
import { updateTaskIn, type TaskChanges } from "../store/update";
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
  const known = new Set([...loaded.tasks.map((task) => task.id), ...unparsedTaskIds(loaded.errors)]);
  const index = buildIndex(loaded.tasks);
  const fixed: string[] = [];
  const failed: string[] = [];
  for (const task of loaded.tasks.filter((candidate) => inScope(candidate.projectId))) {
    const fix = planFix(task, index, (id) => !known.has(id));
    if (fix === null) continue;
    const result = await updateTaskIn(loaded.tasks, { id: task.id, changes: fix.changes, expectedVersion: task.version, now, closure: fix.closure });
    if (result.ok) fixed.push(...fix.notes.map((note) => `${task.id}: ${note}`));
    else failed.push(`${task.id}: не удалось исправить — ${result.reason === "invalid" ? result.errors.join("; ") : "файл изменился"}`);
  }
  return { fixed, failed };
}

function planFix(task: Task, index: BacklogIndex, isGone: (id: string) => boolean): Fix | null {
  const cleanup = referenceCleanup(task, isGone);
  const closedChildren = completedEpicChildren(task, index);
  if (cleanup === null && closedChildren === null) return null;

  const notes: string[] = [];
  if (cleanup !== null) notes.push(`убраны ссылки на несуществующие задачи: ${goneReferences(task, isGone).join(", ")}`);
  if (closedChildren === null) return { changes: cleanup ?? {}, notes };
  const reason = `все задачи эпика закрыты: ${closedChildren.join(", ")}`;
  notes.push(`эпик закрыт — ${reason}`);
  return { changes: { ...cleanup, status: "done" }, closure: { resolution: "epic-done", reason }, notes };
}

function completedEpicChildren(task: Task, index: BacklogIndex): string[] | null {
  if (task.type !== "epic" || isClosed(task.status)) return null;
  const children = epicChildren(task, index);
  const complete = children.length > 0 && children.every((child) => isClosed(child.status));
  return complete ? children.map((child) => child.id) : null;
}

function goneReferences(task: Task, isGone: (id: string) => boolean): string[] {
  const references = [...task.blockedBy, ...task.related, ...(task.epic === undefined ? [] : [task.epic])];
  return [...new Set(references.filter(isGone))];
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
  const parseErrors = loaded.errors.filter((error) => inScope(error.projectId)).map((error) => `Файл ${error.path} не разобран: ${error.message}`);
  const integrity = loaded.tasks
    .filter((task) => inScope(task.projectId))
    .flatMap((task) => integrityErrors(task, index).map((error) => `${task.id}: ${error}`));
  const missingRepos = projects.filter((project) => repos.get(project.id) === undefined).map(missingRepoProblem);
  return [...parseErrors, ...integrity, ...missingRepos];
}

function missingRepoProblem(project: Project): string {
  return project.repos.length === 0
    ? `Проект ${project.id}: в repos нет путей — код его задач не проверить`
    : `Проект ${project.id}: ни один путь из repos не существует (${project.repos.join(", ")}) — код его задач не проверить`;
}
