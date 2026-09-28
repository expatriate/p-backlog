import type { ReactNode } from "react";
import type { TooltipContentProps, TooltipValueType } from "recharts";
import { SwatchMark, type Swatch } from "./ChartFrame";
import styles from "./ChartFrame.module.css";

type TooltipRow = { label: string; value: string } & (Swatch | { shape?: never; color?: never });
export type TooltipView = { title: string; rows: TooltipRow[] };

export function rowTooltip<Row>(describe: (row: Row) => TooltipView) {
  return function RowTooltip({ active, payload }: TooltipContentProps<TooltipValueType, number | string>): ReactNode {
    const row: unknown = payload?.[0]?.payload;
    if (!active || row === undefined) return null;
    const { title, rows } = describe(row as Row);
    return (
      <div className={styles.tooltip}>
        <p className={styles.tooltipTitle}>{title}</p>
        <dl className={styles.tooltipRows}>
          {rows.map((item) => (
            <div key={item.label} className={styles.tooltipRow}>
              <dt>
                {item.shape !== undefined && <SwatchMark shape={item.shape} color={item.color} />}
                {item.label}
              </dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    );
  };
}
