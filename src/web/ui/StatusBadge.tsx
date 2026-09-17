import type { TaskStatus } from "../../core/model/types";
import { STATUS_LABELS } from "../labels";
import { cx } from "./cx";
import styles from "./StatusBadge.module.css";

const MODIFIERS: Record<TaskStatus, string | undefined> = {
  backlog: styles.backlog,
  "in-progress": styles.inProgress,
  blocked: styles.blocked,
  done: styles.done,
  cancelled: styles.cancelled,
};

export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={cx(styles.badge, MODIFIERS[status])}>
      <span className={styles.dot} />
      {STATUS_LABELS[status]}
    </span>
  );
}
