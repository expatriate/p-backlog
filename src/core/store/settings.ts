import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { LANGUAGES, languageFromLocale, type Language } from "../i18n/language";
import { listDir, parseJson, readTextOrNull, writeJsonFile } from "./fs-utils";

const SETTINGS_FILE = ".settings.json";
const settingsSchema = z.object({ language: z.enum(LANGUAGES) });
export type Settings = z.infer<typeof settingsSchema>;

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

export type SettledLanguage = { language: Language; invalidSettingsFile: boolean };

export async function settleLanguage(root: string, env: NodeJS.ProcessEnv): Promise<SettledLanguage> {
  const file = await readSettingsFile(root);
  if (file.found && file.valid) return { language: file.settings.language, invalidSettingsFile: false };
  const locale = () => languageFromLocale(env.LC_ALL || env.LANG || Intl.DateTimeFormat().resolvedOptions().locale);
  if (!file.found) {
    const language = (await hasProjects(root)) ? "ru" : locale();
    await writeSettings(root, { language }).catch(() => {});
    return { language, invalidSettingsFile: false };
  }
  return { language: locale(), invalidSettingsFile: true };
}

async function hasProjects(root: string): Promise<boolean> {
  return (await listDir(root)).some((entry) => entry.isDirectory() && !entry.name.startsWith("."));
}
