import { LANGUAGES } from "../../core/i18n/language";
import { LANGUAGE_NAMES } from "../../core/i18n/messages.ru";
import { requestErrorMessage } from "../app/RequestErrorText";
import { useLanguage, useMessages, useSetLanguage } from "../i18n";
import { cx } from "../ui/cx";
import styles from "./LanguageSwitch.module.css";

export function LanguageSwitch() {
  const language = useLanguage();
  const { app, layout } = useMessages();
  const setLanguage = useSetLanguage();

  return (
    <div className={styles.wrap}>
      <div className={styles.switch} role="group" aria-label={layout.languageSwitchLabel}>
        {LANGUAGES.map((candidate) => (
          <button
            key={candidate}
            type="button"
            className={cx(styles.button, candidate === language && styles.pressed)}
            aria-pressed={candidate === language}
            aria-label={LANGUAGE_NAMES[candidate]}
            disabled={setLanguage.isPending}
            onClick={() => setLanguage.mutate(candidate)}
          >
            {candidate.toUpperCase()}
          </button>
        ))}
      </div>
      {setLanguage.error !== null && (
        <span className={styles.error} role="alert">
          {layout.languageSwitchFailed}: {requestErrorMessage(app, setLanguage.error)}
        </span>
      )}
    </div>
  );
}
