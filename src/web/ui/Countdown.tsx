import { DAY_MS, deletionDate, RETENTION_DAYS } from "../../core/model/lifecycle";
import type { Task } from "../../core/model/types";
import { formatDayMonth } from "../labels";
import { cx } from "./cx";
import styles from "./Countdown.module.css";

export function Countdown({ task, now }: { task: Task; now: Date }) {
  const deletesAt = deletionDate(task);
  if (deletesAt === undefined) return null;
  const remainingMs = Math.max(0, deletesAt.getTime() - now.getTime());
  const lastDay = remainingMs < DAY_MS;
  const fraction = Math.min(1, remainingMs / (RETENTION_DAYS * DAY_MS));
  return (
    <span className={cx(styles.wrap, lastDay && styles.lastDay)} title={`удалится ${formatDayMonth(deletesAt)}`}>
      <span className={styles.track} aria-hidden="true">
        <span className={styles.fill} style={{ width: `${fraction * 100}%` }} />
      </span>
      <span className={styles.value}>{lastDay ? "сегодня" : `${Math.ceil(remainingMs / DAY_MS)} дн.`}</span>
    </span>
  );
}
