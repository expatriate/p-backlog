import type { ReactNode } from "react";
import { MessagesProvider } from "../i18n";
import { Button } from "../ui/Button";
import { appEn } from "./messages.en";
import { appRu } from "./messages.ru";
import { useSettings } from "./queries";
import styles from "./LanguageLoader.module.css";

const SETTINGS_ERROR_TEXT = `${appRu.bootSettingsError} · ${appEn.bootSettingsError}`;
const SETTINGS_RETRY_TEXT = `${appRu.bootRetry} · ${appEn.bootRetry}`;

export function LanguageLoader({ children }: { children: ReactNode }) {
  const settings = useSettings();
  const language = settings.data?.language;

  if (language === undefined && settings.isError) return <SettingsLoadError onRetry={() => void settings.refetch()} />;
  if (language === undefined) return null;
  return <MessagesProvider language={language}>{children}</MessagesProvider>;
}

function SettingsLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className={styles.settingsError} role="alert">
      <p>{SETTINGS_ERROR_TEXT}</p>
      <Button onClick={onRetry}>{SETTINGS_RETRY_TEXT}</Button>
    </div>
  );
}
