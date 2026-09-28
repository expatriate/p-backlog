import { useId, type ReactNode } from "react";
import { cx } from "../ui/cx";
import styles from "./StatsPage.module.css";

export type FigureTone = "growth" | "decline";

export type FigureTrend = { text: string; speech: string; tone: FigureTone };

const TONE_CLASSES: Record<FigureTone, string | undefined> = { growth: styles.growth, decline: styles.decline };

export function Figure({ label, value, note, tone, trend }: { label: string; value: ReactNode; note?: string | undefined; tone?: FigureTone | undefined; trend?: FigureTrend | undefined }) {
  const labelId = useId();

  return (
    <div className={styles.figure} role="group" aria-labelledby={labelId}>
      <span id={labelId} className={styles.figureLabel}>
        {label}
      </span>
      <span className={cx(styles.figureValue, tone !== undefined && TONE_CLASSES[tone])}>{value}</span>
      {trend !== undefined && (
        <span className={cx(styles.figureTrend, TONE_CLASSES[trend.tone])}>
          <span aria-hidden="true">{trend.text}</span>
          <span className="visually-hidden">{trend.speech}</span>
        </span>
      )}
      {note !== undefined && <span className={styles.figureNote}>{note}</span>}
    </div>
  );
}

export function FigureGroup({ period, children }: { period: string; children: ReactNode }) {
  const periodId = useId();
  return (
    <div role="group" aria-labelledby={periodId} className={styles.figureGroup}>
      <p id={periodId} className={styles.note}>
        {period}
      </p>
      <div className={styles.totals}>{children}</div>
    </div>
  );
}
