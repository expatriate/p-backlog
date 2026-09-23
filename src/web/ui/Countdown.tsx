import type { Language } from "../../core/i18n/language";
import { formatDayMonth } from "../../core/i18n/format";
import { DAY_MS, deletionDate, RETENTION_DAYS } from "../../core/model/lifecycle";
import type { Task } from "../../core/model/types";
import { useLanguage, useMessages } from "../i18n";
import { cx } from "./cx";
import type { UiMessages } from "./messages.ru";
import styles from "./Countdown.module.css";

type Deletion = { text: string; title: string; fraction: number; lastDay: boolean };

export function Countdown({ task, now }: { task: Task; now: Date }) {
  const language = useLanguage();
  const { ui } = useMessages();
  const deletion = deletionFor(task, now, language, ui);
  if (deletion === undefined) return null;
  return (
    <span className={cx(styles.wrap, deletion.lastDay && styles.lastDay)} title={deletion.title}>
      <span className={styles.track} aria-hidden="true">
        <span className={styles.fill} style={{ transform: `scaleX(${deletion.fraction})` }} />
      </span>
      <span className={styles.value}>{deletion.text}</span>
    </span>
  );
}

export function DeletionBar({ task, now }: { task: Task; now: Date }) {
  const language = useLanguage();
  const { ui } = useMessages();
  const deletion = deletionFor(task, now, language, ui);
  if (deletion === undefined) return null;
  return (
    <span className={cx(styles.bar, deletion.lastDay && styles.lastDay)} title={deletion.title} role="img" aria-label={`${deletion.text}, ${deletion.title}`}>
      <span className={styles.barFill} style={{ transform: `scaleY(${deletion.fraction})` }} />
    </span>
  );
}

function deletionFor(task: Task, now: Date, language: Language, ui: UiMessages): Deletion | undefined {
  const deletesAt = deletionDate(task);
  if (deletesAt === undefined) return undefined;
  const dayMonth = formatDayMonth(language, deletesAt);
  if (now.getTime() >= deletesAt.getTime()) {
    return { text: ui.deletionDelayed, title: ui.deletionDelayedTitle(dayMonth), fraction: 0, lastDay: false };
  }
  const remainingMs = deletesAt.getTime() - now.getTime();
  const lastDay = remainingMs < DAY_MS;
  return {
    text: lastDay ? ui.deletesToday : ui.deletesInDays(Math.ceil(remainingMs / DAY_MS)),
    title: ui.deletesOn(dayMonth),
    fraction: Math.min(1, remainingMs / (RETENTION_DAYS * DAY_MS)),
    lastDay,
  };
}
