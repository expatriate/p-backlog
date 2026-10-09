import type { Language } from "./i18n/language";
import { coreMessages } from "./messages";
import { settingsFilePath, settleLanguage } from "./store/settings";

export async function settleLanguageReportingProblems(root: string, env: NodeJS.ProcessEnv, warn: (line: string) => void): Promise<Language> {
  const { language, invalidSettingsFile, saveFailure } = await settleLanguage(root, env);
  const messages = coreMessages(language);
  const file = settingsFilePath(root);
  if (invalidSettingsFile) warn(messages.settingsFileInvalid(file));
  if (saveFailure !== null) warn(messages.settingsNotSaved(file, saveFailure));
  return language;
}
