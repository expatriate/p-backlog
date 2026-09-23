import { rm } from "node:fs/promises";
import { join } from "node:path";
import { parseProjectFile, serializeProject } from "../model/project-file";
import type { Project } from "../model/types";
import { readTextOrNull, writeFileAtomic } from "./fs-utils";
import { PROJECT_FILE, projectDir } from "./paths";

type ProjectNotFound = { ok: false; reason: "not-found" };

const NOT_FOUND: ProjectNotFound = { ok: false, reason: "not-found" };

export type ProjectWriteResult = { ok: true; project: Project } | ProjectNotFound | { ok: false; reason: "invalid"; message: string };

export type ProjectDeleteResult = { ok: true } | ProjectNotFound;

export async function setProjectActive(root: string, id: string, active: boolean): Promise<ProjectWriteResult> {
  const dir = projectDir(root, id);
  if (dir === null) return NOT_FOUND;
  const path = join(dir, PROJECT_FILE);
  const text = await readTextOrNull(path);
  if (text === null) return NOT_FOUND;
  const parsed = parseProjectFile(text, { id, path });
  if (!parsed.ok) return { ok: false, reason: "invalid", message: parsed.message };
  const project = { ...parsed.value, active };
  await writeFileAtomic(path, serializeProject(project));
  return { ok: true, project };
}

export async function deleteProject(root: string, id: string): Promise<ProjectDeleteResult> {
  const dir = projectDir(root, id);
  if (dir === null || (await readTextOrNull(join(dir, PROJECT_FILE))) === null) return NOT_FOUND;
  await rm(dir, { recursive: true, force: true });
  return { ok: true };
}
