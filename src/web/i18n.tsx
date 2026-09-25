import { createContext, useContext, useEffect, type ReactNode } from "react";
import type { Language } from "../core/i18n/language";
import { coreMessages, type CoreMessages } from "../core/messages";
import { appEn } from "./app/messages.en";
import { appRu } from "./app/messages.ru";
import { layoutEn } from "./layout/messages.en";
import { layoutRu } from "./layout/messages.ru";
import { listEn } from "./list/messages.en";
import { listRu } from "./list/messages.ru";
import { statsEn } from "./stats/messages.en";
import { statsRu } from "./stats/messages.ru";
import { taskEn } from "./task/messages.en";
import { taskRu } from "./task/messages.ru";
import { uiEn } from "./ui/messages.en";
import { uiRu } from "./ui/messages.ru";

const CATALOGS = {
  ru: { app: appRu, layout: layoutRu, list: listRu, task: taskRu, stats: statsRu, ui: uiRu },
  en: { app: appEn, layout: layoutEn, list: listEn, task: taskEn, stats: statsEn, ui: uiEn },
};

export type WebMessages = (typeof CATALOGS)["ru"] & { core: CoreMessages };

const LanguageContext = createContext<Language | null>(null);
const MessagesContext = createContext<WebMessages | null>(null);

const MESSAGES: { [L in Language]: WebMessages } = {
  ru: { ...CATALOGS.ru, core: coreMessages("ru") },
  en: { ...CATALOGS.en, core: coreMessages("en") },
};

export function MessagesProvider({ language, children }: { language: Language; children: ReactNode }) {
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  return (
    <LanguageContext.Provider value={language}>
      <MessagesContext.Provider value={MESSAGES[language]}>{children}</MessagesContext.Provider>
    </LanguageContext.Provider>
  );
}

export function useLanguage(): Language {
  const language = useContext(LanguageContext);
  if (language === null) throw new Error("MessagesProvider is not mounted");
  return language;
}

export function useMessages(): WebMessages {
  const messages = useContext(MessagesContext);
  if (messages === null) throw new Error("MessagesProvider is not mounted");
  return messages;
}
