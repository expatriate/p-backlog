import type { Language } from "../core/i18n/language";
import { cliEn } from "./messages.en";
import { cliRu, type CliMessages } from "./messages.ru";

export type { CliMessages } from "./messages.ru";

export function cliMessages(language: Language): CliMessages {
  return language === "ru" ? cliRu : cliEn;
}
