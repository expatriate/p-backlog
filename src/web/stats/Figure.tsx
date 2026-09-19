import { cx } from "../ui/cx";
import styles from "./StatsPage.module.css";

export type FigureTrend = { text: string; speech: string; better: boolean };

export function Figure({ label, value, note, tone, trend }: { label: string; value: string; note: string; tone?: "growth" | "decline"; trend?: FigureTrend }) {
  return (
    <div className={styles.figure} role="group" aria-label={label}>
      <span className={styles.figureLabel}>{label}</span>
      <span className={cx(styles.figureValue, tone === "growth" && styles.growth, tone === "decline" && styles.decline)}>{value}</span>
      {trend !== undefined && (
        <span className={cx(styles.figureTrend, trend.better ? styles.decline : styles.growth)}>
          <span aria-hidden="true">{trend.text}</span>
          <span className="visually-hidden">{trend.speech}</span>
        </span>
      )}
      <span className={styles.figureNote}>{note}</span>
    </div>
  );
}
