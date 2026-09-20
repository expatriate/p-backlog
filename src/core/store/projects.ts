import { rm } from "node:fs/promises";
import { join } from "node:path";
import { parseProjectFile, serializeProject } from "../model/project-file";
import type { Project } from "../model/types";
import { readTextOrNull, writeFileAtomic } from "./fs-utils";
import { PROJECT_FILE } from "./paths";

export type ProjectWriteResult = { ok: true; project: Project } | { ok: false; reason: "not-found" };

export type ProjectDeleteResult = { ok: true } | { ok: false; reason: "not-found" };

export async function setProjectActive(root: string, id: string, active: boolean): Promise<ProjectWriteResult> {
  const path = join(root, id, PROJECT_FILE);
  const text = await readTextOrNull(path);
  if (text === null) return { ok: false, reason: "not-found" };
  const parsed = parseProjectFile(text, { id, path });
  if (!parsed.ok) return { ok: false, reason: "not-found" };
  const project = { ...parsed.value, active };
  await writeFileAtomic(path, serializeProject(project));
  return { ok: true, project };
}

export async function deleteProject(root: string, id: string): Promise<ProjectDeleteResult> {
  const dir = join(root, id);
  if ((await readTextOrNull(join(dir, PROJECT_FILE))) === null) return { ok: false, reason: "not-found" };
  await rm(dir, { recursive: true, force: true });
  return { ok: true };
}
