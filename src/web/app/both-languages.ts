import { uiEn } from "../ui/messages.en";
import { uiRu, type UiMessages } from "../ui/messages.ru";
import { appEn } from "./messages.en";
import { appRu, type AppMessages } from "./messages.ru";

type BootMessages = { app: AppMessages; ui: UiMessages };

export function inBothLanguages(pick: (messages: BootMessages) => string): string {
  return `${pick({ app: appRu, ui: uiRu })} · ${pick({ app: appEn, ui: uiEn })}`;
}
