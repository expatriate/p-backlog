import type { TaskStatus } from "../../core/model/types";
import { useMessages } from "../i18n";
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
  const { core } = useMessages();
  return (
    <span className={cx(styles.badge, MODIFIERS[status])}>
      <span className={styles.dot} />
      {core.statusLabel(status)}
    </span>
  );
}
