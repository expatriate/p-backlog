import { basename } from "node:path";
import { buildIndex } from "../model/graph";
import { integrityErrors } from "../model/integrity";
import { planEpicClosing } from "../model/lifecycle";
import type { ParseError, Project } from "../model/types";
import type { LoadedBacklog } from "../store/load";
import { PROJECT_FILE } from "../store/paths";
import type { CheckProblem } from "./findings";

export function findProblems(loaded: LoadedBacklog, projects: readonly Project[], repos: ReadonlyMap<string, string | undefined>, inScope: (projectId: string) => boolean): CheckProblem[] {
  const index = buildIndex(loaded.tasks);
  const integrity = loaded.tasks.filter((task) => inScope(task.projectId)).flatMap((task) => integrityErrors(task, index).map((problem): CheckProblem => ({ kind: "task-invalid", taskId: task.id, problem })));
  const missingRepos = projects.filter((project) => repos.get(project.id) === undefined).map(missingRepoProblem);
  return [...parseProblems(loaded, inScope), ...integrity, ...missingRepos, ...sharedPrefixes(loaded.projects, inScope)];
}

function sharedPrefixes(projects: readonly Project[], inScope: (projectId: string) => boolean): CheckProblem[] {
  const idsByPrefix = new Map<string, string[]>();
  for (const project of projects) idsByPrefix.set(project.prefix, [...(idsByPrefix.get(project.prefix) ?? []), project.id]);
  return [...idsByPrefix].filter(([, projectIds]) => projectIds.length > 1 && projectIds.some(inScope)).map(([prefix, projectIds]): CheckProblem => ({ kind: "prefix-shared", prefix, projectIds }));
}

function parseProblems(loaded: LoadedBacklog, inScope: (projectId: string) => boolean): CheckProblem[] {
  const waitingEpicIds = planEpicClosing(loaded.tasks, loaded.errors)
    .waiting.filter(({ epic }) => inScope(epic.projectId))
    .map(({ epic }) => epic.id);
  const everyFileMayHoldWaitingChild = waitingEpicIds.length > 0;
  const reported = loaded.errors
    .filter((error) => everyFileMayHoldWaitingChild || concernsScope(error, inScope))
    .map((error): CheckProblem => ({ kind: "file-not-parsed", path: error.path, problems: error.problems }));
  if (waitingEpicIds.length === 0) return reported;
  return [...reported, { kind: "epics-wait-for-files", epicIds: waitingEpicIds }];
}

function concernsScope(error: ParseError, inScope: (projectId: string) => boolean): boolean {
  return inScope(error.projectId) || basename(error.path) === PROJECT_FILE;
}

function missingRepoProblem(project: Project): CheckProblem {
  return project.repos.length === 0 ? { kind: "project-without-repos", projectId: project.id } : { kind: "project-repos-missing", projectId: project.id, repos: project.repos };
}
