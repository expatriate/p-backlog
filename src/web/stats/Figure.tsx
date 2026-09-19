import { cx } from "../ui/cx";
import styles from "./StatsPage.module.css";

export function Figure({ label, value, note, tone }: { label: string; value: string; note: string; tone?: "growth" | "decline" }) {
  return (
    <div className={styles.figure} role="group" aria-label={label}>
      <span className={styles.figureLabel}>{label}</span>
      <span className={cx(styles.figureValue, tone === "growth" && styles.growth, tone === "decline" && styles.decline)}>{value}</span>
      <span className={styles.figureNote}>{note}</span>
    </div>
  );
}
