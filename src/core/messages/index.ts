import type { Language } from "../i18n/language";
import { coreEn } from "./en";
import { coreRu } from "./ru";
import type { CoreMessages } from "./types";

export type { CoreMessages } from "./types";

export function coreMessages(language: Language): CoreMessages {
  return language === "ru" ? coreRu : coreEn;
}
