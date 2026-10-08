import type { ReactNode } from "react";
import type { TooltipContentProps } from "recharts";
import { SwatchMark } from "./ChartFrame";
import styles from "./ChartFrame.module.css";
import { isPlotted, tooltipValue, type SeriesEntry } from "./series";

type SeriesTooltipProps<Row> = { title: (row: Row) => string; series: SeriesEntry<Row>[] } & Partial<Pick<TooltipContentProps, "active" | "payload">>;

export function SeriesTooltip<Row>({ title, series, active, payload }: SeriesTooltipProps<Row>): ReactNode {
  const row = payload?.[0]?.payload as Row | undefined;
  if (active !== true || row === undefined) return null;
  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltipTitle}>{title(row)}</p>
      <dl className={styles.tooltipRows}>
        {series.map((entry) => {
          const label = entry.tooltipLabel ?? entry.label;
          return (
            <div key={label} className={styles.tooltipRow}>
              <dt>
                {isPlotted(entry) && <SwatchMark shape={entry.shape} color={entry.color} />}
                {label}
              </dt>
              <dd>{tooltipValue(entry, row)}</dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
