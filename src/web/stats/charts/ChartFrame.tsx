import { useId, type CSSProperties, type ReactElement } from "react";
import { ResponsiveContainer } from "recharts";
import { cx } from "../../ui/cx";
import styles from "./ChartFrame.module.css";

type LegendShape = "bar" | "line" | "dashed" | "hatch";
export type Swatch = { shape: LegendShape; color: string };
type LegendItem = { label: string } & Swatch;

const PLOT_HEIGHT_PX = { regular: 220, compact: 180 };
const INITIAL_DIMENSION = { width: 360, height: PLOT_HEIGHT_PX.regular };
const PLOT_HEIGHTS = { "--plot-height": `${PLOT_HEIGHT_PX.regular}px`, "--plot-height-compact": `${PLOT_HEIGHT_PX.compact}px` } as CSSProperties;

export function ChartFrame({ summary, legend, children }: { summary: string; legend: LegendItem[]; children: ReactElement }) {
  const summaryId = useId();
  return (
    <figure className={styles.frame} aria-labelledby={summaryId}>
      <p id={summaryId} className={styles.summary}>
        {summary}
      </p>
      <div className={styles.plot} style={PLOT_HEIGHTS}>
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
