import type { Language } from "../core/i18n/language";

type SkillVariant = { plugin: string; sourceDir: string };

export const SKILL_NAME = "backlog";

export const SKILL_SOURCES_DIR = "skill";

export const SKILL_VARIANTS: Record<Language, SkillVariant> = {
  en: { plugin: "p-backlog", sourceDir: "backlog-en" },
  ru: { plugin: "p-backlog-ru", sourceDir: "backlog" },
};
