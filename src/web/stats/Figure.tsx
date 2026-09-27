import { useId, type ReactNode } from "react";
import { cx } from "../ui/cx";
import styles from "./StatsPage.module.css";

export type FigureTrend = { text: string; speech: string; better: boolean };

export function Figure({ label, value, note, tone, trend }: { label: string; value: ReactNode; note: string; tone?: "growth" | "decline" | undefined; trend?: FigureTrend | undefined }) {
  const labelId = useId();

  return (
    <div className={styles.figure} role="group" aria-labelledby={labelId}>
      <span id={labelId} className={styles.figureLabel}>
        {label}
      </span>
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

export function FigureGroup({ period, children }: { period: string; children: ReactNode }) {
  const periodId = useId();
  return (
    <div role="group" aria-describedby={periodId} className={styles.figureGroup}>
      <p id={periodId} className={styles.note}>
        {period}
      </p>
      <div className={styles.totals}>{children}</div>
    </div>
  );
}
