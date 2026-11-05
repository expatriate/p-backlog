import { basename, join } from "node:path";
import { compareIds, ID_PATTERN, parseId } from "../model/ids";
import { parseProjectFile } from "../model/project-file";
import { parseTaskFile } from "../model/task-file";
import type { NotLoadedTasks, ParseError, ParseResult, Project, ProjectFileError, Task, UnparsedFile } from "../model/types";
import { contentVersion, listDir } from "./fs-utils";
import { PROJECT_FILE } from "./paths";
import { parseDocumentOrNull } from "./read-document";

export type LoadedBacklog = { projects: Project[]; tasks: Task[]; errors: ParseError[] };

export type UnparsedTask = { projectId: string; id: string };

export function unparsedTasks(errors: readonly ParseError[]): UnparsedTask[] {
  return errors.flatMap((error) => (error.fileKind === "task" ? [{ projectId: error.projectId, id: taskIdOfFile(error.path) }] : []));
}

export function isProjectFileError(error: ParseError): error is ProjectFileError {
  return error.fileKind === "project";
}

export function unparsedProjectFiles(errors: readonly ParseError[]): ProjectFileError[] {
  return errors.filter(isProjectFileError);
}

export function unparsedProjectFileOf(errors: readonly ParseError[], projectId: string): ProjectFileError | undefined {
  return unparsedProjectFiles(errors).find((error) => error.projectId === projectId);
}

export function notLoadedTasks(errors: readonly ParseError[]): NotLoadedTasks {
  return new Map(errors.flatMap((error): [string, UnparsedFile][] => (error.fileKind === "task" ? [[taskIdOfFile(error.path), "task"]] : error.hiddenTasks.map((id) => [id, "project"]))));
}

function taskIdOfFile(path: string): string {
  return basename(path, ".md");
}

export async function projectDirNames(root: string): Promise<string[]> {
  return (await listDir(root)).filter((entry) => entry.isDirectory() && !entry.name.startsWith(".")).map((entry) => entry.name);
}

export async function loadBacklog(root: string): Promise<LoadedBacklog> {
  const parts = await Promise.all((await projectDirNames(root)).map((name) => loadProjectDir(join(root, name), name)));
  return {
    projects: parts.flatMap((part) => part.projects).sort((a, b) => a.id.localeCompare(b.id)),
    tasks: parts.flatMap((part) => part.tasks).sort((a, b) => compareIds(a.id, b.id)),
    errors: parts.flatMap((part) => part.errors).sort((a, b) => a.path.localeCompare(b.path)),
  };
}

async function loadProjectDir(dir: string, projectId: string): Promise<LoadedBacklog> {
  const projectPath = join(dir, PROJECT_FILE);
  const project = await parseDocumentOrNull(projectPath, (text) => parseProjectFile(text, { id: projectId, path: projectPath }));
  if (project === null) return { projects: [], tasks: [], errors: [] };
  if (!project.ok) {
    const hiddenTasks = [...(await taskIdsOnDisk(dir))].sort(compareIds);
    return { projects: [], tasks: [], errors: [{ path: projectPath, projectId, fileKind: "project", problems: project.problems, hiddenTasks }] };
  }

  const taskPaths = (await taskFileNames(dir)).map((name) => join(dir, name));
  const loaded = await Promise.all(taskPaths.map(async (path) => ({ path, result: await loadTaskFile(path, project.value) })));
  return {
    projects: [project.value],
    tasks: loaded.flatMap(({ result }) => (result?.ok ? [result.value] : [])),
    errors: loaded.flatMap(({ path, result }) => (result && !result.ok ? [{ path, projectId, fileKind: "task" as const, problems: result.problems }] : [])),
  };
}

async function loadTaskFile(path: string, project: Project): Promise<ParseResult<Task> | null> {
  const parsed = await parseDocumentOrNull(path, (text) => parseTaskFile(text, { projectId: project.id, path, version: contentVersion(text) }));
  if (parsed === null || !parsed.ok) return parsed;
  const stem = basename(path, ".md");
  if (parsed.value.id !== stem) return { ok: false, problems: [{ code: "id-mismatch", id: parsed.value.id, file: stem }] };
  if (parseId(stem)?.prefix !== project.prefix) {
    return { ok: false, problems: [{ code: "prefix-mismatch", file: stem, prefix: project.prefix }] };
  }
  return parsed;
}

export async function taskIdsOnDisk(projectDir: string): Promise<Set<string>> {
  return new Set((await taskFileNames(projectDir)).map((name) => basename(name, ".md")));
}

async function taskFileNames(projectDir: string): Promise<string[]> {
  return (await listDir(projectDir)).filter((entry) => entry.isFile() && isTaskFileName(entry.name)).map((entry) => entry.name);
}

function isTaskFileName(name: string): boolean {
  return name.endsWith(".md") && ID_PATTERN.test(name.slice(0, -".md".length));
}
