import { appEn } from "./messages.en";
import { appRu, type AppMessages } from "./messages.ru";

export function inBothLanguages(pick: (messages: AppMessages) => string): string {
  return `${pick(appRu)} · ${pick(appEn)}`;
}
