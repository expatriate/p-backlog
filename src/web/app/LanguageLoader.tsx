import type { ReactNode } from "react";
import { MessagesProvider } from "../i18n";
import { Button } from "../ui/Button";
import { PageMessage } from "../ui/Page";
import { inBothLanguages } from "./both-languages";
import { useSettings } from "./queries";
import styles from "./LanguageLoader.module.css";

const SETTINGS_ERROR_TEXT = inBothLanguages((app) => app.bootSettingsError);
const SETTINGS_RETRY_TEXT = inBothLanguages((app) => app.bootRetry);
const SETTINGS_RETRYING_TEXT = inBothLanguages((app) => app.bootRetrying);

export function LanguageLoader({ children }: { children: ReactNode }) {
  const settings = useSettings();
  const language = settings.data?.language;

  if (language !== undefined) return <MessagesProvider language={language}>{children}</MessagesProvider>;
  const settingsNeverFailed = settings.errorUpdateCount === 0;
  if (settingsNeverFailed) return null;
  return <SettingsLoadError retrying={settings.isFetching} onRetry={() => void settings.refetch()} />;
}

function SettingsLoadError({ retrying, onRetry }: { retrying: boolean; onRetry: () => void }) {
  return (
    <PageMessage className={styles.settingsError} role="alert">
      <p>{SETTINGS_ERROR_TEXT}</p>
      <Button busy={retrying} onClick={onRetry}>
        {retrying ? SETTINGS_RETRYING_TEXT : SETTINGS_RETRY_TEXT}
      </Button>
    </PageMessage>
  );
}
