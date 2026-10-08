import { mkdir, readlink, symlink, unlink } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { z } from "zod";
import type { Language } from "../core/i18n/language";
import { lstatOrNull, parseJson, readTextOrNull } from "../core/store/fs-utils";
import { SKILL_NAME } from "../core/skill-name";
import { SKILL_SOURCES_DIR, SKILL_VARIANTS } from "./skill-variants";

type SkillLinkResult = "linked" | "kept" | "foreign";

export type SkillUnlinkResult = "removed" | "absent" | "foreign";

export type SkillLinkOptions = { skillsDir: string; packageRoot: string; platform: NodeJS.Platform };

const SKILL_SOURCE_DIRS = new Set(Object.values(SKILL_VARIANTS).map((variant) => variant.sourceDir));
const packageManifestSchema = z.object({ name: z.string() });

export function skillSourceDir(packageRoot: string, language: Language): string {
  return join(packageRoot, SKILL_SOURCES_DIR, SKILL_VARIANTS[language].sourceDir);
}

export function skillLinkPath(skillsDir: string): string {
  return join(skillsDir, SKILL_NAME);
}

async function isPBacklogSkill(path: string): Promise<boolean> {
  if (!SKILL_SOURCE_DIRS.has(basename(path)) || basename(dirname(path)) !== SKILL_SOURCES_DIR) return false;
  const manifest = await readTextOrNull(join(dirname(dirname(path)), "package.json"));
  if (manifest !== null) return parseJson(manifest, packageManifestSchema)?.name === "p-backlog";
  return !(await pathExists(path));
}

async function pathExists(path: string): Promise<boolean> {
  return (await lstatOrNull(path)) !== null;
}

export async function linkSkillFor(language: Language, { skillsDir, packageRoot, platform }: SkillLinkOptions): Promise<SkillLinkResult> {
  const target = skillLinkPath(skillsDir);
  const source = skillSourceDir(packageRoot, language);
  const existing = await lstatOrNull(target);
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

export async function relinkExistingSkill(language: Language, options: SkillLinkOptions): Promise<SkillLinkResult | "absent"> {
  if (!(await pathExists(skillLinkPath(options.skillsDir)))) return "absent";
  return linkSkillFor(language, options);
}

export async function unlinkOurSkill(skillsDir: string): Promise<SkillUnlinkResult> {
  const target = skillLinkPath(skillsDir);
  const existing = await lstatOrNull(target);
  if (existing === null) return "absent";
  if (!existing.isSymbolicLink() || !(await isPBacklogSkill(resolve(skillsDir, await readlink(target))))) return "foreign";
  await unlink(target);
  return "removed";
}
