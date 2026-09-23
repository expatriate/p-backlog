import type { Language } from "../core/i18n/language";
import { resolveLanguage } from "../core/store/settings";
import { serverEn } from "./messages.en";
import { serverRu, type ServerMessages } from "./messages.ru";

export type { ServerMessages } from "./messages.ru";

export function serverMessages(language: Language): ServerMessages {
  return language === "ru" ? serverRu : serverEn;
}

export function serverLanguage(root: string): Promise<Language> {
  return resolveLanguage(root, process.env);
}
