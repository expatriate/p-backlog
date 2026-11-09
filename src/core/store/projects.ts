import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { PathErrorHandler } from "../errors";
import { parseProjectFile, serializeProject } from "../model/project-file";
import type { Problem } from "../model/problems";
import type { ParseResult, Project } from "../model/types";
import { withFileLock } from "./file-lock";
import { fileExists, readTextOrNull } from "./fs-utils";
import { writeFileAtomic } from "./atomic-write";
import { PROJECT_FILE, projectDir } from "./paths";
import { parseDocumentOrNull } from "./read-document";

type ProjectNotFound = { ok: false; reason: "not-found" };

const NOT_FOUND: ProjectNotFound = { ok: false, reason: "not-found" };

export type ProjectWriteResult = { ok: true; project: Project; changed: boolean } | ProjectNotFound | { ok: false; reason: "invalid"; problems: Problem[] };

export type ProjectDeleteResult = { ok: true } | ProjectNotFound;

export async function setProjectActive(root: string, id: string, active: boolean, onError: PathErrorHandler): Promise<ProjectWriteResult> {
  const dir = projectDir(root, id);
  if (dir === null) return NOT_FOUND;
  return editProjectFile({ id, path: join(dir, PROJECT_FILE) }, onError, (project) => (project.active === active ? project : { ...project, active }));
}

export function reserveIssuedUpTo(project: Pick<Project, "id" | "path">, number: number, onError: PathErrorHandler): Promise<ProjectWriteResult> {
  return editProjectFile(project, onError, (current) => {
    const issuedUpTo = Math.max(current.issuedUpTo ?? 0, number);
    return issuedUpTo === current.issuedUpTo ? current : { ...current, issuedUpTo };
  });
}

export async function issuedUpToOnDisk(project: Pick<Project, "id" | "path">): Promise<number> {
  const parsed = await readProjectFile(project);
  return parsed?.ok === true ? (parsed.value.issuedUpTo ?? 0) : 0;
}

export async function readProjectFile({ id, path }: Pick<Project, "id" | "path">): Promise<ParseResult<Project> | null> {
  return parseDocumentOrNull(path, (text) => parseProjectFile(text, { id, path }));
}

async function editProjectFile({ id, path }: Pick<Project, "id" | "path">, onError: PathErrorHandler, edit: (project: Project) => Project): Promise<ProjectWriteResult> {
  if (!(await fileExists(path))) return NOT_FOUND;
  const reportAfterWrite = (error: unknown) => onError(path, error);
  let written: ProjectWriteResult | null = null;
  try {
    return await withFileLock(path, async () => {
      const parsed = await readProjectFile({ id, path });
      if (parsed === null) return NOT_FOUND;
      if (!parsed.ok) return { ok: false, reason: "invalid", problems: parsed.problems };
      const project = edit(parsed.value);
      const changed = project !== parsed.value;
      if (changed) await writeFileAtomic(path, serializeProject(project), { onErrorAfterPublish: reportAfterWrite });
      written = { ok: true, project, changed };
      return written;
    });
  } catch (error) {
    if (written === null) throw error;
    reportAfterWrite(error);
    return written;
  }
}

export async function deleteProject(root: string, id: string): Promise<ProjectDeleteResult> {
  const dir = projectDir(root, id);
  if (dir === null || (await readTextOrNull(join(dir, PROJECT_FILE))) === null) return NOT_FOUND;
  await rm(dir, { recursive: true, force: true });
  return { ok: true };
}
