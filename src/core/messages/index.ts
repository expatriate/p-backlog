import type { Language } from "../i18n/language";
import { coreEn } from "./en";
import { coreRu, type CoreMessages } from "./ru";

export type { CoreMessages } from "./ru";

export function coreMessages(language: Language): CoreMessages {
  return language === "ru" ? coreRu : coreEn;
}
