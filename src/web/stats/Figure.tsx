import { useId, type ReactNode } from "react";
import { cx } from "../ui/cx";
import styles from "./Figure.module.css";
import layout from "./StatsLayout.module.css";

export type FigureTone = "growth" | "decline";

export type FigureTrend = { text: string; speech: string; tone: FigureTone };

const TONE_CLASSES: Record<FigureTone, string | undefined> = { growth: styles.growth, decline: styles.decline };

export function Figure({ label, value, note, tone, trend }: { label: string; value: ReactNode; note?: string | undefined; tone?: FigureTone | undefined; trend?: FigureTrend | undefined }) {
  const labelId = useId();

  return (
    <div className={styles.figure} role="group" aria-labelledby={labelId}>
      <span id={labelId} className={styles.label}>
        {label}
      </span>
      <span className={cx(styles.value, tone !== undefined && TONE_CLASSES[tone])}>{value}</span>
      {trend !== undefined && (
        <span className={cx(styles.trend, TONE_CLASSES[trend.tone])}>
          <span aria-hidden="true">{trend.text}</span>
          <span className="visually-hidden">{trend.speech}</span>
        </span>
      )}
      {note !== undefined && <span className={styles.note}>{note}</span>}
    </div>
  );
}

export function Figures({ columns, children }: { columns: 2 | 4; children: ReactNode }) {
  return <div className={cx(styles.figures, columns === 2 && styles.pair)}>{children}</div>;
}

export function ToneText({ tone, children }: { tone: FigureTone | undefined; children: ReactNode }) {
  return <span className={tone === undefined ? undefined : TONE_CLASSES[tone]}>{children}</span>;
}

export function FigureGroup({ period, children }: { period: string; children: ReactNode }) {
  const periodId = useId();
  return (
    <div role="group" aria-labelledby={periodId} className={styles.group}>
      <p id={periodId} className={layout.note}>
        {period}
      </p>
      <Figures columns={4}>{children}</Figures>
    </div>
  );
}
