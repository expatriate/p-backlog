import { createContext, useContext, useEffect, type ReactNode } from "react";
import type { Language } from "../core/i18n/language";
import { coreMessages, type CoreMessages } from "../core/messages";
import { appEn } from "./app/messages.en";
import { appRu } from "./app/messages.ru";
import { useSettings } from "./app/queries";
import { layoutEn } from "./layout/messages.en";
import { layoutRu } from "./layout/messages.ru";
import { uiEn } from "./ui/messages.en";
import { uiRu } from "./ui/messages.ru";

export { useSetLanguage } from "./app/queries";

const CATALOGS = {
  ru: { app: appRu, layout: layoutRu, ui: uiRu },
  en: { app: appEn, layout: layoutEn, ui: uiEn },
};

export type WebMessages = (typeof CATALOGS)["ru"] & { core: CoreMessages };

const LanguageContext = createContext<Language | null>(null);
const MessagesContext = createContext<WebMessages | null>(null);

export function MessagesProvider({ children }: { children: ReactNode }) {
  const settings = useSettings();
  const language = settings.data?.language;

  useEffect(() => {
    if (language !== undefined) document.documentElement.lang = language;
  }, [language]);

  if (language === undefined) return null;

  const messages: WebMessages = { ...CATALOGS[language], core: coreMessages(language) };

  return (
    <LanguageContext.Provider value={language}>
      <MessagesContext.Provider value={messages}>{children}</MessagesContext.Provider>
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
