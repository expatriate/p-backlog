import { createContext, useContext, useEffect, type ReactNode } from "react";
import type { Language } from "../core/i18n/language";
import { coreMessages, type CoreMessages } from "../core/messages";
import { appEn } from "./app/messages.en";
import { appRu } from "./app/messages.ru";
import { useSettings } from "./app/queries";
import { layoutEn } from "./layout/messages.en";
import { layoutRu } from "./layout/messages.ru";
import { listEn } from "./list/messages.en";
import { listRu } from "./list/messages.ru";
import { Button } from "./ui/Button";
import { uiEn } from "./ui/messages.en";
import { uiRu } from "./ui/messages.ru";
import styles from "./i18n.module.css";

const SETTINGS_ERROR_TEXT = `${appRu.bootSettingsError} · ${appEn.bootSettingsError}`;
const SETTINGS_RETRY_TEXT = `${appRu.bootRetry} · ${appEn.bootRetry}`;

export { useSetLanguage } from "./app/queries";

const CATALOGS = {
  ru: { app: appRu, layout: layoutRu, list: listRu, ui: uiRu },
  en: { app: appEn, layout: layoutEn, list: listEn, ui: uiEn },
};

export type WebMessages = (typeof CATALOGS)["ru"] & { core: CoreMessages };

const LanguageContext = createContext<Language | null>(null);
const MessagesContext = createContext<WebMessages | null>(null);

function messagesFor(language: Language): WebMessages {
  return { ...CATALOGS[language], core: coreMessages(language) };
}

export function MessagesProvider({ children }: { children: ReactNode }) {
  const settings = useSettings();
  const language = settings.data?.language;

  useEffect(() => {
    if (language !== undefined) document.documentElement.lang = language;
  }, [language]);

  if (settings.isError) return <SettingsLoadError onRetry={() => void settings.refetch()} />;
  if (language === undefined) return null;

  return (
    <LanguageContext.Provider value={language}>
      <MessagesContext.Provider value={messagesFor(language)}>{children}</MessagesContext.Provider>
    </LanguageContext.Provider>
  );
}

export function TestMessagesProvider({ language = "ru", children }: { language?: Language; children: ReactNode }) {
  return (
    <LanguageContext.Provider value={language}>
      <MessagesContext.Provider value={messagesFor(language)}>{children}</MessagesContext.Provider>
    </LanguageContext.Provider>
  );
}

function SettingsLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className={styles.settingsError} role="alert">
      <p>{SETTINGS_ERROR_TEXT}</p>
      <Button onClick={onRetry}>{SETTINGS_RETRY_TEXT}</Button>
    </div>
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
