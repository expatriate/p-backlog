import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { LANGUAGES, languageFromLocale, type Language } from "../i18n/language";
import { listDir, readJsonFile, writeJsonFile } from "./fs-utils";

const SETTINGS_FILE = ".settings.json";
const settingsSchema = z.object({ language: z.enum(LANGUAGES) });
export type Settings = z.infer<typeof settingsSchema>;

export function readSettings(root: string): Promise<Settings | null> {
  return readJsonFile(join(root, SETTINGS_FILE), settingsSchema);
}

export async function writeSettings(root: string, settings: Settings): Promise<void> {
  await mkdir(root, { recursive: true });
  await writeJsonFile(join(root, SETTINGS_FILE), settings);
}

export async function settledLanguage(root: string, env: NodeJS.ProcessEnv): Promise<Language> {
  const stored = await readSettings(root);
  if (stored !== null) return stored.language;
  const language = (await hasProjects(root))
    ? "ru"
    : languageFromLocale(env.LC_ALL || env.LANG || Intl.DateTimeFormat().resolvedOptions().locale);
  await writeSettings(root, { language }).catch(() => {});
  return language;
}

async function hasProjects(root: string): Promise<boolean> {
  return (await listDir(root)).some((entry) => entry.isDirectory() && !entry.name.startsWith("."));
}
