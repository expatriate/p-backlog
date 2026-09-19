import { useId, type CSSProperties, type ReactElement } from "react";
import { ResponsiveContainer } from "recharts";
import { cx } from "../../ui/cx";
import styles from "./ChartFrame.module.css";

export type LegendShape = "bar" | "line" | "dashed" | "hatch";
export type LegendItem = { label: string; shape: LegendShape; color: string };

const INITIAL_DIMENSION = { width: 360, height: 180 };

export function ChartFrame({ summary, legend, children }: { summary: string; legend: LegendItem[]; children: ReactElement }) {
  const summaryId = useId();
  return (
    <figure className={styles.frame} aria-labelledby={summaryId}>
      <p id={summaryId} className={styles.summary}>
        {summary}
      </p>
      <div className={styles.plot}>
        <ResponsiveContainer width="100%" height="100%" initialDimension={INITIAL_DIMENSION}>
          {children}
        </ResponsiveContainer>
      </div>
      {legend.length > 0 && (
        <figcaption className={styles.legend}>
          {legend.map((item) => (
            <span key={item.label} className={styles.legendItem}>
              <span className={cx(styles.swatch, styles[item.shape])} style={{ "--swatch": item.color } as CSSProperties} aria-hidden="true" />
              {item.label}
            </span>
          ))}
        </figcaption>
      )}
    </figure>
  );
}
