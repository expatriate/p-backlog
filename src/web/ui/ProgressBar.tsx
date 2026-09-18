import { formatProgress } from "../labels";
import { cx } from "./cx";
import styles from "./ProgressBar.module.css";

export function ProgressBar({ progress }: { progress: number | null }) {
  if (progress === null) return <span className={styles.value}>—</span>;
  return (
    <span className={cx(styles.wrap, progress === 100 && styles.done)}>
      <span className={styles.track} role="progressbar" aria-label="Прогресс" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
        <span className={styles.fill} style={{ transform: `scaleX(${progress / 100})` }} />
      </span>
      <span className={styles.value}>{formatProgress(progress)}</span>
    </span>
  );
}
