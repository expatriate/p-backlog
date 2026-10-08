import { useId, type CSSProperties, type ReactElement } from "react";
import { ResponsiveContainer } from "recharts";
import { cx } from "../../ui/cx";
import styles from "./ChartFrame.module.css";

type LegendShape = "bar" | "line" | "dashed" | "hatch";
export type Swatch = { shape: LegendShape; color: string };
type LegendItem = { label: string } & Swatch;

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
              <SwatchMark shape={item.shape} color={item.color} />
              {item.label}
            </span>
          ))}
        </figcaption>
      )}
    </figure>
  );
}

export function SwatchMark({ shape, color }: Swatch) {
  return <span className={cx(styles.swatch, styles[shape])} style={{ "--swatch": color } as CSSProperties} aria-hidden="true" />;
}
