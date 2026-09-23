import { basename, join } from "node:path";
import { compareIds, ID_PATTERN, parseId } from "../model/ids";
import { parseProjectFile } from "../model/project-file";
import { parseTaskFile } from "../model/task-file";
import type { ParseError, ParseResult, Project, Task } from "../model/types";
import { contentVersion, listDir, readTextOrNull } from "./fs-utils";
import { PROJECT_FILE } from "./paths";

export type LoadedBacklog = { projects: Project[]; tasks: Task[]; errors: ParseError[] };

export async function loadBacklog(root: string): Promise<LoadedBacklog> {
  const projectDirs = (await listDir(root)).filter((entry) => entry.isDirectory() && !entry.name.startsWith("."));
  const parts = await Promise.all(projectDirs.map((entry) => loadProjectDir(join(root, entry.name), entry.name)));
  return {
    projects: parts.flatMap((part) => part.projects).sort((a, b) => a.id.localeCompare(b.id)),
    tasks: parts.flatMap((part) => part.tasks).sort((a, b) => compareIds(a.id, b.id)),
    errors: parts.flatMap((part) => part.errors).sort((a, b) => a.path.localeCompare(b.path)),
  };
}

async function loadProjectDir(dir: string, projectId: string): Promise<LoadedBacklog> {
  const projectPath = join(dir, PROJECT_FILE);
  const projectText = await readTextOrNull(projectPath);
  if (projectText === null) return { projects: [], tasks: [], errors: [] };
  const project: ParseResult<Project> = parseProjectFile(projectText, { id: projectId, path: projectPath });
  if (!project.ok) return { projects: [], tasks: [], errors: [{ path: projectPath, projectId, problems: project.problems }] };

  const taskPaths = (await listDir(dir))
    .filter((entry) => entry.isFile() && isTaskFileName(entry.name))
    .map((entry) => join(dir, entry.name));
  const loaded = await Promise.all(taskPaths.map(async (path) => ({ path, result: await loadTaskFile(path, project.value) })));
  return {
    projects: [project.value],
    tasks: loaded.flatMap(({ result }) => (result?.ok ? [result.value] : [])),
    errors: loaded.flatMap(({ path, result }) => (result && !result.ok ? [{ path, projectId, problems: result.problems }] : [])),
  };
}

async function loadTaskFile(path: string, project: Project): Promise<ParseResult<Task> | null> {
  const text = await readTextOrNull(path);
  if (text === null) return null;
  const parsed = parseTaskFile(text, { projectId: project.id, path, version: contentVersion(text) });
  if (!parsed.ok) return parsed;
  const stem = basename(path, ".md");
  if (parsed.value.id !== stem) return { ok: false, problems: [{ code: "id-mismatch", id: parsed.value.id, file: stem }] };
  if (parseId(stem)?.prefix !== project.prefix) {
    return { ok: false, problems: [{ code: "prefix-mismatch", file: stem, prefix: project.prefix }] };
  }
  return parsed;
}

function isTaskFileName(name: string): boolean {
  return name.endsWith(".md") && ID_PATTERN.test(name.slice(0, -".md".length));
}
