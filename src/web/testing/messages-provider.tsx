import type { ReactNode } from "react";
import type { Language } from "../../core/i18n/language";
import { MessagesProvider } from "../i18n";

export function TestMessagesProvider({ language = "ru", children }: { language?: Language; children: ReactNode }) {
  return <MessagesProvider language={language}>{children}</MessagesProvider>;
}
