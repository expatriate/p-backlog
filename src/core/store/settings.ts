import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { errorText } from "../errors";
import { languageFromLocale, type Language } from "../i18n/language";
import { settingsSchema, type Settings } from "../model/settings";
import { parseJson, readTextOrNull, writeJsonFile } from "./fs-utils";
import { projectDirNames } from "./load";

const SETTINGS_FILE = ".settings.json";

export function settingsFilePath(root: string): string {
  return join(root, SETTINGS_FILE);
}

type SettingsFile = { found: false } | { found: true; valid: false } | { found: true; valid: true; settings: Settings };

async function readSettingsFile(root: string): Promise<SettingsFile> {
  const text = await readTextOrNull(settingsFilePath(root));
  if (text === null) return { found: false };
  const settings = parseJson(text, settingsSchema);
  return settings === null ? { found: true, valid: false } : { found: true, valid: true, settings };
}

export async function writeSettings(root: string, settings: Settings): Promise<void> {
  await mkdir(root, { recursive: true });
  await writeJsonFile(settingsFilePath(root), settings);
}

export type SettledLanguage = { language: Language; invalidSettingsFile: boolean; saveFailure: string | null };

type LanguageSource = "settings" | "unset" | "invalid-settings";

const LANGUAGE_OF_BACKLOGS_BEFORE_SETTINGS: Language = "ru";

export async function settleLanguage(root: string, env: NodeJS.ProcessEnv): Promise<SettledLanguage> {
  const { language, source } = await decideLanguage(root, env);
  const saveFailure = source === "unset" ? await saveLanguageOrFailure(root, language) : null;
  return { language, invalidSettingsFile: source === "invalid-settings", saveFailure };
}

export async function readLanguageOrLocale(root: string, env: NodeJS.ProcessEnv): Promise<Language> {
  try {
    return (await decideLanguage(root, env)).language;
  } catch {
    return localeLanguage(env);
  }
}

async function decideLanguage(root: string, env: NodeJS.ProcessEnv): Promise<{ language: Language; source: LanguageSource }> {
  const file = await readSettingsFile(root);
  if (!file.found) return { language: (await hasProjects(root)) ? LANGUAGE_OF_BACKLOGS_BEFORE_SETTINGS : localeLanguage(env), source: "unset" };
  return file.valid ? { language: file.settings.language, source: "settings" } : { language: localeLanguage(env), source: "invalid-settings" };
}

async function saveLanguageOrFailure(root: string, language: Language): Promise<string | null> {
  try {
    await writeSettings(root, { language });
    return null;
  } catch (error) {
    return errorText(error);
  }
}

export function localeLanguage(env: NodeJS.ProcessEnv): Language {
  return languageFromLocale(env.LC_ALL || env.LANG || Intl.DateTimeFormat().resolvedOptions().locale);
}

async function hasProjects(root: string): Promise<boolean> {
  return (await projectDirNames(root)).length > 0;
}
