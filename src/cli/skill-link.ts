import { lstat, mkdir, readlink, symlink, unlink } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { z } from "zod";
import type { Language } from "../core/i18n/language";
import { parseJson, readTextOrNull } from "../core/store/fs-utils";

export type SkillLinkResult = "linked" | "kept" | "foreign";

export type SkillLinkOptions = { skillsDir: string; packageRoot: string; platform: NodeJS.Platform };

const SKILL_VARIANTS = new Set(["backlog", "backlog-en"]);
const packageManifestSchema = z.object({ name: z.string() });

export function skillSourceDir(packageRoot: string, language: Language): string {
  return join(packageRoot, "skill", language === "ru" ? "backlog" : "backlog-en");
}

async function isPBacklogSkill(path: string): Promise<boolean> {
  if (!SKILL_VARIANTS.has(basename(path)) || basename(dirname(path)) !== "skill") return false;
  const manifest = await readTextOrNull(join(dirname(dirname(path)), "package.json"));
  if (manifest !== null) return parseJson(manifest, packageManifestSchema)?.name === "p-backlog";
  return !(await pathExists(path));
}

async function pathExists(path: string): Promise<boolean> {
  return (await lstat(path).catch(() => null)) !== null;
}

export async function linkSkillFor(language: Language, { skillsDir, packageRoot, platform }: SkillLinkOptions): Promise<SkillLinkResult> {
  const target = join(skillsDir, "backlog");
  const source = skillSourceDir(packageRoot, language);
  const existing = await lstat(target).catch(() => null);
  if (existing !== null && !existing.isSymbolicLink()) return "foreign";
  if (existing !== null) {
    const resolved = resolve(skillsDir, await readlink(target));
    if (resolved === source) return "kept";
    if (!(await isPBacklogSkill(resolved))) return "foreign";
    await unlink(target);
  }
  await mkdir(skillsDir, { recursive: true });
  await symlink(source, target, platform === "win32" ? "junction" : "dir");
  return "linked";
}
