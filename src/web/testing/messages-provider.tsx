import type { ReactNode } from "react";
import type { Language } from "../../core/i18n/language";
import { LanguageContext, messagesFor, MessagesContext } from "../i18n";

export function TestMessagesProvider({ language = "ru", children }: { language?: Language; children: ReactNode }) {
  return (
    <LanguageContext.Provider value={language}>
      <MessagesContext.Provider value={messagesFor(language)}>{children}</MessagesContext.Provider>
    </LanguageContext.Provider>
  );
}
