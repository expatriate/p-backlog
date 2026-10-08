import { Link, type To } from "react-router";
import { cx } from "./cx";
import type { EpicTone } from "./epic-tone";
import styles from "./TaskId.module.css";

export function TaskId({ id, tone }: { id: string; tone?: EpicTone | undefined }) {
  return (
    <span className={styles.id} data-epic-tone={tone}>
      {id}
    </span>
  );
}

export function TaskIdLink({ id, to }: { id: string; to: To }) {
  return (
    <Link to={to} className={cx(styles.id, styles.link)}>
      {id}
    </Link>
  );
}
