import { rm } from "node:fs/promises";
import { join } from "node:path";
import { parseProjectFile, serializeProject } from "../model/project-file";
import type { Problem } from "../model/problems";
import type { Project } from "../model/types";
import { readTextOrNull, writeFileAtomic } from "./fs-utils";
import { PROJECT_FILE, projectDir } from "./paths";

type ProjectNotFound = { ok: false; reason: "not-found" };

const NOT_FOUND: ProjectNotFound = { ok: false, reason: "not-found" };

export type ProjectWriteResult = { ok: true; project: Project } | ProjectNotFound | { ok: false; reason: "invalid"; problems: Problem[] };

export type ProjectDeleteResult = { ok: true } | ProjectNotFound;

export async function setProjectActive(root: string, id: string, active: boolean): Promise<ProjectWriteResult> {
  const dir = projectDir(root, id);
  if (dir === null) return NOT_FOUND;
  return editProjectFile({ id, path: join(dir, PROJECT_FILE) }, (project) => ({ ...project, active }));
}

export async function reserveIssuedUpTo(project: Pick<Project, "id" | "path">, number: number): Promise<boolean> {
  const edited = await editProjectFile(project, (current) => {
    const issuedUpTo = Math.max(current.issuedUpTo ?? 0, number);
    return issuedUpTo === current.issuedUpTo ? current : { ...current, issuedUpTo };
  });
  return edited.ok;
}

async function editProjectFile({ id, path }: Pick<Project, "id" | "path">, edit: (project: Project) => Project): Promise<ProjectWriteResult> {
  const text = await readTextOrNull(path);
  if (text === null) return NOT_FOUND;
  const parsed = parseProjectFile(text, { id, path });
  if (!parsed.ok) return { ok: false, reason: "invalid", problems: parsed.problems };
  const project = edit(parsed.value);
  if (project !== parsed.value) await writeFileAtomic(path, serializeProject(project));
  return { ok: true, project };
}

export async function deleteProject(root: string, id: string): Promise<ProjectDeleteResult> {
  const dir = projectDir(root, id);
  if (dir === null || (await readTextOrNull(join(dir, PROJECT_FILE))) === null) return NOT_FOUND;
  await rm(dir, { recursive: true, force: true });
  return { ok: true };
}
