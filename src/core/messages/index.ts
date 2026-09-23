import type { Language } from "../i18n/language";
import { coreEn } from "./en";
import { coreRu } from "./ru";

export type CoreMessages = typeof coreRu;

export function coreMessages(language: Language): CoreMessages {
  return language === "ru" ? coreRu : coreEn;
}
