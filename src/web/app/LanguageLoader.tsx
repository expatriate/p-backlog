import type { ReactNode } from "react";
import { MessagesProvider } from "../i18n";
import { Button } from "../ui/Button";
import { PageMessage } from "../ui/Page";
import { inBothLanguages } from "./both-languages";
import { useSettings } from "./queries";
import { useFailureKeptWhileRefetching } from "./use-failure-kept-while-refetching";
import styles from "./LanguageLoader.module.css";

const SETTINGS_ERROR_TEXT = inBothLanguages(({ app }) => app.bootSettingsError);
const SETTINGS_RETRY_TEXT = inBothLanguages(({ ui }) => ui.retry);
const SETTINGS_RETRYING_TEXT = inBothLanguages(({ ui }) => ui.retrying);

export function LanguageLoader({ children }: { children: ReactNode }) {
  const settings = useSettings();
  const settingsFailure = useFailureKeptWhileRefetching(settings);
  const language = settings.data?.language;

  if (language !== undefined) return <MessagesProvider language={language}>{children}</MessagesProvider>;
  if (settingsFailure === null) return null;
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
