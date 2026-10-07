import { formatDayMonth } from "../../core/i18n/format";
import { deletionDate, RETENTION_DAYS } from "../../core/model/lifecycle";
import type { Task } from "../../core/model/types";
import { useLanguage, useMessages } from "../i18n";
import { cx } from "./cx";
import { DAY_MS } from "../../core/model/dates";
import styles from "./Deletion.module.css";

type Deletion = { text: string; title: string; fraction: number; lastDay: boolean };

export function DeletionCountdown({ task, now }: { task: Task; now: Date }) {
  const deletion = useDeletion(task, now);
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
  const deletion = useDeletion(task, now);
  if (deletion === undefined) return null;
  return (
    <span className={cx(styles.bar, deletion.lastDay && styles.lastDay)} title={deletion.title} role="img" aria-label={`${deletion.text}, ${deletion.title}`}>
      <span className={styles.barFill} style={{ transform: `scaleY(${deletion.fraction})` }} />
    </span>
  );
}

function useDeletion(task: Task, now: Date): Deletion | undefined {
  const language = useLanguage();
  const { ui } = useMessages();
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
