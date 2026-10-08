import { formatProgress } from "../labels";
import { useMessages } from "../i18n";
import { cx } from "./cx";
import { Meter } from "./Meter";
import styles from "./ProgressBar.module.css";

export function ProgressBar({ progress }: { progress: number | null }) {
  const { ui } = useMessages();
  if (progress === null) return <span className={styles.value}>{formatProgress(progress)}</span>;
  return (
    <span className={cx(styles.wrap, progress === 100 && styles.done)}>
      <Meter fraction={progress / 100} role="progressbar" aria-label={ui.progress} aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} />
      <span className={styles.value}>{formatProgress(progress)}</span>
    </span>
  );
}
