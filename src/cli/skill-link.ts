import { lstat, mkdir, readlink, symlink, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Language } from "../core/i18n/language";

export type SkillLinkResult = "linked" | "kept" | "foreign";

export function skillSourceDir(repoRoot: string, language: Language): string {
  return join(repoRoot, "skill", language === "ru" ? "backlog" : "backlog-en");
}

export function defaultSkillsDir(home: string): string {
  return join(home, ".claude/skills");
}

export async function linkSkillFor(language: Language, { skillsDir, repoRoot }: { skillsDir: string; repoRoot: string }): Promise<SkillLinkResult> {
  const target = join(skillsDir, "backlog");
  const source = skillSourceDir(repoRoot, language);
  const existing = await lstat(target).catch(() => null);
  if (existing !== null && !existing.isSymbolicLink()) return "foreign";
  if (existing !== null) {
    const resolved = resolve(skillsDir, await readlink(target));
    if (resolved === source) return "kept";
    if (resolved !== skillSourceDir(repoRoot, "ru") && resolved !== skillSourceDir(repoRoot, "en")) return "foreign";
    await unlink(target);
  }
  await mkdir(skillsDir, { recursive: true });
  await symlink(source, target, "dir");
  return "linked";
}
