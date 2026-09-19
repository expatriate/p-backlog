import { DAY_MS, deletionDate, RETENTION_DAYS } from "../../core/model/lifecycle";
import type { Task } from "../../core/model/types";
import { formatDayMonth } from "../../core/stats/format";
import { cx } from "./cx";
import styles from "./Countdown.module.css";

type Deletion = { text: string; title: string; fraction: number; lastDay: boolean };

export function Countdown({ task, now }: { task: Task; now: Date }) {
  const deletion = deletionFor(task, now);
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
  const deletion = deletionFor(task, now);
  if (deletion === undefined) return null;
  return (
    <span className={cx(styles.bar, deletion.lastDay && styles.lastDay)} title={deletion.title} role="img" aria-label={`${deletion.text}, ${deletion.title}`}>
      <span className={styles.barFill} style={{ transform: `scaleY(${deletion.fraction})` }} />
    </span>
  );
}

export function DeletionLabel({ task, now }: { task: Task; now: Date }) {
  const deletion = deletionFor(task, now);
  if (deletion === undefined) return null;
  return (
    <span className={cx(styles.value, deletion.lastDay && styles.urgent)} title={deletion.title}>
      {deletion.text}
    </span>
  );
}

function deletionFor(task: Task, now: Date): Deletion | undefined {
  const deletesAt = deletionDate(task);
  if (deletesAt === undefined) return undefined;
  if (now.getTime() >= deletesAt.getTime()) {
    return {
      text: "удаление задержано",
      title: `должна была удалиться ${formatDayMonth(deletesAt)}; проход удаления держит задачу, пока её эпик не закрыт или беклог не исправлен`,
      fraction: 0,
      lastDay: false,
    };
  }
  const remainingMs = deletesAt.getTime() - now.getTime();
  const lastDay = remainingMs < DAY_MS;
  return {
    text: lastDay ? "удалится сегодня" : `удалится через ${Math.ceil(remainingMs / DAY_MS)} дн.`,
    title: `удалится ${formatDayMonth(deletesAt)}`,
    fraction: Math.min(1, remainingMs / (RETENTION_DAYS * DAY_MS)),
    lastDay,
  };
}
